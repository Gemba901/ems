import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { tenantTransaction } from 'src/prisma/tenant-transaction';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import type {
  ExecutionProvider,
  SubmittedResult,
} from '../../common/contracts';
import {
  MonitoringQueryDto,
  ReturnResultsDto,
  VerifyResultsDto,
} from '../dto/monitoring-control.dto';
import { MONITORING_EXECUTION_SOURCE } from '../monitoring-control.sources';
import {
  canSeeAssignment,
  dateOnly,
  loadActor,
  ymd,
  type MonitoringActor,
} from '../monitoring-scope';

/** Just what checkSubmission needs to know about the caller. */
export type VerifierContext = Pick<MonitoringActor, 'employeeId' | 'active'>;

export interface RowFailure {
  submissionId: string;
  problems: string[];
}

const blank = (s: string | null | undefined) => !s || !s.trim();
const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const key = (assignmentId: string, periodId: string) =>
  `${assignmentId}|${periodId}`;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MONITORING_EXECUTION_SOURCE)
    private readonly execution: ExecutionProvider,
  ) {}

  /** Submitted results where the caller is the assigned verifier. */
  async getQueue(user: AccessTokenPayload, q: MonitoringQueryDto) {
    const actor = await loadActor(this.prisma, user);
    if (!actor.employeeId) return [];

    const rows = (
      await this.execution.listSubmitted(
        user.organizationId,
        q.assignmentId ? [q.assignmentId] : undefined,
      )
    ).filter(
      (s) =>
        s.assignment.verifierId === actor.employeeId &&
        (!q.departmentId || s.assignment.departmentId === q.departmentId) &&
        (!q.month || s.target.end.startsWith(q.month)),
    );
    const official = await this.loadOfficial(
      this.prisma,
      user.organizationId,
      rows,
    );

    return rows.map((s) => {
      const prev = official.get(key(s.assignmentId, s.periodId));
      return {
        submissionId: s.id,
        assignmentId: s.assignmentId,
        code: s.assignment.code,
        name: s.assignment.definition.name,
        unit: s.assignment.definition.unit,
        periodId: s.periodId,
        periodStart: s.target.start,
        periodEnd: s.target.end,
        target: s.target.value,
        upper: s.target.upper ?? null,
        actual: s.actual,
        inputA: s.inputA,
        inputB: s.inputB,
        evidence: s.evidence,
        note: s.note,
        submittedById: s.submittedById,
        submittedAt: s.submittedAt,
        isCorrection: !!prev,
        currentOfficial: prev?.actual ?? null,
        correctionReason: s.correctionReason,
        problems: this.checkSubmission(actor, s, prev ?? null),
      };
    });
  }

  /** Who may decide on this submission at all (used by verify AND return). */
  authorityProblems(actor: VerifierContext, s: SubmittedResult): string[] {
    const out: string[] = [];
    if (!actor.employeeId) {
      out.push(
        'You need an employee record in this company to verify results.',
      );
      return out;
    }
    if (s.assignment.verifierId !== actor.employeeId) {
      out.push('Only the assigned verifier can decide on this result.');
    }
    if (s.submittedById === actor.employeeId) {
      out.push('You cannot verify a result you submitted.');
    }
    if (!actor.active) out.push('Only an active employee can verify results.');
    return out;
  }

  /** Whether the submitted data is fit to become official. */
  dataProblems(
    s: SubmittedResult,
    existing: { actual: number } | null,
    now = new Date(),
  ): string[] {
    const out: string[] = [];
    const { definition: def } = s.assignment;
    const t = s.target;

    if (!t.scheduled) out.push('This period is not scheduled for this KPI.');
    if (ymd(now) <= t.end) out.push('This period has not ended yet.');

    if (!finite(s.actual)) {
      out.push('The actual value is missing.');
    } else if (def.calc !== 'direct') {
      if (!finite(s.inputA) || !finite(s.inputB)) {
        out.push('Both inputs are required for this KPI.');
      } else if (s.inputB === 0) {
        out.push('The second input cannot be zero.');
      } else {
        const expected =
          (s.inputA / s.inputB) * (def.calc === 'percent' ? 100 : 1);
        if (
          Math.abs(expected - s.actual) >
          1e-6 * Math.max(1, Math.abs(expected))
        ) {
          out.push('The stored actual does not match its inputs.');
        }
      }
    }

    if (!finite(t.value)) {
      out.push('The period target is missing.');
    } else if (
      def.direction === 'range' &&
      (!finite(t.upper) || t.upper < t.value)
    ) {
      out.push('This range target needs a valid upper bound.');
    } else if (def.direction === 'zero') {
      if (t.value !== 0) out.push('A zero-target KPI must have a target of 0.');
      if (finite(s.actual) && s.actual < 0)
        out.push('The actual cannot be negative for a zero-target KPI.');
    }

    if (blank(s.evidence)) out.push('Add an evidence or source reference.');
    if (existing && blank(s.correctionReason)) {
      out.push('A correction of an official value needs a reason.');
    }
    if (blank(s.submittedById) || !s.submittedAt) {
      out.push('The submitter and submission time are missing.');
    }
    return out;
  }

  /** Every reason a submission cannot be verified (empty = OK). */
  checkSubmission(
    actor: VerifierContext,
    s: SubmittedResult,
    existing: { actual: number } | null,
    now = new Date(),
  ): string[] {
    return [
      ...this.authorityProblems(actor, s),
      ...this.dataProblems(s, existing, now),
    ];
  }

  /** All-or-nothing: one failing row means nothing is verified. */
  async verify(user: AccessTokenPayload, dto: VerifyResultsDto) {
    const actor = await loadActor(this.prisma, user);
    const orgId = user.organizationId;

    return tenantTransaction(this.prisma, orgId, async (tx) => {
      // Re-load inside the transaction: a row may have changed since the queue was shown.
      const rows = await this.loadRequested(orgId, dto.submissionIds);
      const official = await this.loadOfficial(tx, orgId, [...rows.values()]);

      const seen = new Set<string>();
      const failures: RowFailure[] = dto.submissionIds.flatMap((id) => {
        const s = rows.get(id);
        if (!s)
          return [
            {
              submissionId: id,
              problems: ['Not found, or no longer waiting for verification.'],
            },
          ];
        const k = key(s.assignmentId, s.periodId);
        const problems = this.checkSubmission(
          actor,
          s,
          official.get(k) ?? null,
        );
        if (seen.has(k))
          problems.push(
            'Another selected result is for the same KPI and period.',
          );
        seen.add(k);
        return problems.length ? [{ submissionId: id, problems }] : [];
      });
      if (failures.length) {
        throw new UnprocessableEntityException({
          message: 'No results were verified.',
          failures,
        });
      }

      const now = new Date();
      for (const id of dto.submissionIds) {
        const s = rows.get(id)!;
        const prev = official.get(key(s.assignmentId, s.periodId));
        const snapshot = this.snapshot(s, dto.note);
        const values = {
          periodStart: dateOnly(s.target.start),
          periodEnd: dateOnly(s.target.end),
          departmentId: s.assignment.departmentId,
          submissionId: s.id,
          actual: s.actual,
          inputA: s.inputA,
          inputB: s.inputB,
          evidence: s.evidence,
          note: s.note,
          snapshot,
          verifiedById: actor.employeeId!,
          verifiedAt: now,
        };
        await tx.lexOfficialResult.upsert({
          where: {
            organizationId_assignmentId_periodId: {
              organizationId: orgId,
              assignmentId: s.assignmentId,
              periodId: s.periodId,
            },
          },
          create: {
            organizationId: orgId,
            assignmentId: s.assignmentId,
            periodId: s.periodId,
            ...values,
          },
          update: { ...values, revision: { increment: 1 } },
        });
        await tx.lexVerificationEvent.create({
          data: {
            organizationId: orgId,
            submissionId: s.id,
            assignmentId: s.assignmentId,
            periodId: s.periodId,
            action: 'VERIFIED',
            actual: s.actual,
            previousActual: prev?.actual ?? null,
            reason: prev ? s.correctionReason : null,
            snapshot,
            actorId: actor.employeeId!,
          },
        });
      }
      await this.execution.markVerified(tx, orgId, dto.submissionIds);
      return { verified: dto.submissionIds.length };
    });
  }

  /** Sends results back to the submitter. An existing official value stays official. */
  async returnForCorrection(user: AccessTokenPayload, dto: ReturnResultsDto) {
    const actor = await loadActor(this.prisma, user);
    const orgId = user.organizationId;
    const reason = dto.reason.trim();
    if (!reason)
      throw new UnprocessableEntityException('Explain what must be corrected.');

    return tenantTransaction(this.prisma, orgId, async (tx) => {
      const rows = await this.loadRequested(orgId, dto.submissionIds);
      const failures: RowFailure[] = dto.submissionIds.flatMap((id) => {
        const s = rows.get(id);
        if (!s)
          return [
            {
              submissionId: id,
              problems: ['Not found, or no longer waiting for verification.'],
            },
          ];
        const problems = this.authorityProblems(actor, s);
        return problems.length ? [{ submissionId: id, problems }] : [];
      });
      if (failures.length) {
        throw new UnprocessableEntityException({
          message: 'No results were returned.',
          failures,
        });
      }

      await tx.lexVerificationEvent.createMany({
        data: dto.submissionIds.map((id) => {
          const s = rows.get(id)!;
          return {
            organizationId: orgId,
            submissionId: s.id,
            assignmentId: s.assignmentId,
            periodId: s.periodId,
            action: 'RETURNED' as const,
            actual: s.actual,
            reason,
            snapshot: this.snapshot(s),
            actorId: actor.employeeId!,
          };
        }),
      });
      await this.execution.markReturned(tx, orgId, dto.submissionIds, reason);
      return { returned: dto.submissionIds.length };
    });
  }

  /** Verification decisions within the caller's scope, newest first. */
  async getHistory(user: AccessTokenPayload, q: MonitoringQueryDto) {
    const actor = await loadActor(this.prisma, user);
    const where: Prisma.LexVerificationEventWhereInput = {
      organizationId: user.organizationId,
    };
    if (q.assignmentId) where.assignmentId = q.assignmentId;
    if (q.month) {
      const [y, m] = q.month.split('-').map(Number);
      where.createdAt = {
        gte: new Date(Date.UTC(y, m - 1, 1)),
        lt: new Date(Date.UTC(y, m, 1)),
      };
    }
    const events = await this.prisma.lexVerificationEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return events
      .map((e) => ({
        e,
        a: (
          e.snapshot as unknown as { assignment: SubmittedResult['assignment'] }
        ).assignment,
      }))
      .filter(
        ({ a }) =>
          (!q.departmentId || a.departmentId === q.departmentId) &&
          canSeeAssignment(actor, a),
      )
      .map(({ e, a }) => ({
        id: e.id,
        submissionId: e.submissionId,
        assignmentId: e.assignmentId,
        code: a.code,
        name: a.definition.name,
        periodId: e.periodId,
        action: e.action,
        actual: e.actual === null ? null : Number(e.actual),
        previousActual:
          e.previousActual === null ? null : Number(e.previousActual),
        reason: e.reason,
        actorId: e.actorId,
        createdAt: e.createdAt,
      }));
  }

  // ── helpers ────────────────────────────────────────────

  private async loadRequested(orgId: string, ids: string[]) {
    const wanted = new Set(ids);
    const all = await this.execution.listSubmitted(orgId);
    return new Map(all.filter((s) => wanted.has(s.id)).map((s) => [s.id, s]));
  }

  private async loadOfficial(
    db: Prisma.TransactionClient | PrismaService,
    orgId: string,
    rows: SubmittedResult[],
  ) {
    if (!rows.length) return new Map<string, { actual: number }>();
    const found = await db.lexOfficialResult.findMany({
      where: {
        organizationId: orgId,
        OR: rows.map((s) => ({
          assignmentId: s.assignmentId,
          periodId: s.periodId,
        })),
      },
      select: { assignmentId: true, periodId: true, actual: true },
    });
    return new Map(
      found.map((o) => [
        key(o.assignmentId, o.periodId),
        { actual: Number(o.actual) },
      ]),
    );
  }

  /** Plan + target exactly as submitted, so later re-planning never rewrites history. */
  private snapshot(
    s: SubmittedResult,
    verifierNote?: string,
  ): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify({
        assignment: s.assignment,
        target: s.target,
        submittedById: s.submittedById,
        submittedAt: s.submittedAt,
        verifierNote: verifierNote?.trim() || null,
      }),
    ) as Prisma.InputJsonValue;
  }
}

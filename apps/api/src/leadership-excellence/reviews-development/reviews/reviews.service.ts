import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  LexReview,
  LexReviewAcknowledgement,
  LexReviewStatus,
  LexReviewVersion,
} from 'db';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { tenantTransaction } from 'src/prisma/tenant-transaction';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import type { ReviewablePlan } from '../../common/contracts';
import { ReviewsDevelopmentSources } from '../reviews-development.sources';
import {
  canAccessAction,
  canReadReview,
  isParticipant,
  today,
  type DevelopmentActor,
  type People,
} from '../development-scope';
import { isUniqueViolation, logEvent, pad } from '../development-events';
import { buildSnapshot, fingerprint, planOwners } from './review-facts';
import type {
  AcknowledgeReviewDto,
  CreateReviewDto,
  UpdateReflectionDto,
  UpdateReviewDiscussionDto,
} from '../dto/reviews-development.dto';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const clip = (v: string | undefined, max = 2500) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

type ReviewRow = LexReview & {
  versions: LexReviewVersion[];
  acknowledgement: LexReviewAcknowledgement[];
  actionLinks: { actionId: string }[];
};

const INCLUDE = {
  versions: { orderBy: { version: 'asc' } },
  acknowledgement: { orderBy: { version: 'asc' } },
  actionLinks: { select: { actionId: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.LexReviewInclude;

/** The approved content frozen in each LexReviewVersion. */
export function reviewContent(r: LexReview) {
  return {
    meetingDate: ymd(r.meetingDate),
    achievements: r.achievements,
    challenges: r.challenges,
    learning: r.learning,
    supportNeeded: r.supportNeeded,
    reflectionSubmittedAt: r.reflectionSubmittedAt?.toISOString() ?? null,
    recognition: r.recognition,
    findings: r.findings,
    decisions: r.decisions,
    noInputReason: r.noInputReason,
    dataLimitReason: r.dataLimitReason,
    nextReviewDate: r.nextReviewDate ? ymd(r.nextReviewDate) : null,
    snapshot: r.snapshot,
  };
}

/** Statuses a review can still change in. */
const OPEN_STATUSES: LexReviewStatus[] = ['DRAFT', 'SUBMITTED'];

/** 06.01 Department and personal performance reviews. */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: ReviewsDevelopmentSources,
  ) {}

  // ── context ─────────────────────────────────────────────────────────────

  private async context(user: AccessTokenPayload) {
    const [actor, people] = await Promise.all([
      this.sources.actor(user),
      this.sources.people(user.organizationId),
    ]);
    return { actor, people };
  }

  /** Plans the caller may start a review on: they are its subject or reviewer. */
  eligible(actor: DevelopmentActor, people: People, plans: ReviewablePlan[]) {
    if (!actor.employeeId || !actor.active) return [];
    return plans.flatMap((plan) => {
      const o = planOwners(plan, people);
      if (!o.subjectId || !o.reviewerId) return [];
      if (!people.get(o.subjectId)?.active || !people.get(o.reviewerId)?.active)
        return [];
      if (
        !isParticipant(actor, {
          ...o,
          subjectId: o.subjectId,
          reviewerId: o.reviewerId,
        })
      )
        return [];
      return [{ plan, ...o, subjectId: o.subjectId, reviewerId: o.reviewerId }];
    });
  }

  /** Plans the caller can review, with suggested periods (closed KPI periods). */
  async getContext(user: AccessTokenPayload) {
    const { actor, people } = await this.context(user);
    const plans = await this.sources.plans(user.organizationId);
    const list = this.eligible(actor, people, plans);
    const now = today();
    return {
      me: actor.employeeId,
      today: now,
      plans: await Promise.all(
        list.map(async (e) => {
          const first = e.plan.assignments[0];
          const periods = first
            ? await this.sources.targets(user.organizationId, first.id, {
                documentId: e.plan.documentId,
                version: e.plan.version,
              })
            : [];
          return {
            documentId: e.plan.documentId,
            version: e.plan.version,
            kind: e.plan.kind,
            type: e.type,
            title: e.plan.title,
            cycle: e.plan.cycle,
            departmentId: e.departmentId,
            subjectId: e.subjectId,
            reviewerId: e.reviewerId,
            reviewFrequency: first?.reviewFrequency || null,
            periods: periods.map((p) => ({
              start: p.start,
              end: p.end,
              closed: p.end <= now,
            })),
            relatesTo: [
              { key: 'role', label: 'Role responsibilities' },
              ...e.plan.goals.map((g) => ({
                key: `goal:${g.id}`,
                label: `${g.code ? g.code + ' · ' : ''}${g.title}`,
              })),
              ...e.plan.assignments.map((a) => ({
                key: `kpi:${a.id}`,
                label: `${a.code ? a.code + ' · ' : ''}${a.name}`,
              })),
            ],
          };
        }),
      ),
    };
  }

  // ── facts ───────────────────────────────────────────────────────────────

  private async snapshotFor(
    organizationId: string,
    plan: ReviewablePlan,
    start: string,
    end: string,
    subjectId: string,
  ) {
    const ids = plan.assignments.map((a) => a.id);
    const [official, actions, targets] = await Promise.all([
      this.sources.official(organizationId, ids),
      this.sources.actions(organizationId),
      Promise.all(
        plan.assignments.map(
          async (a) =>
            [
              a.id,
              await this.sources.targets(organizationId, a.id, {
                documentId: plan.documentId,
                version: plan.version,
              }),
            ] as const,
        ),
      ),
    ]);
    return buildSnapshot({
      plan,
      start,
      end,
      asOf: today(),
      subjectId,
      targets: new Map(targets),
      official,
      actions,
    });
  }

  private async plan(organizationId: string, documentId: string) {
    const plan = (await this.sources.plans(organizationId)).find(
      (p) => p.documentId === documentId,
    );
    if (!plan)
      throw new NotFoundException(
        'The approved plan for this review is no longer available.',
      );
    return plan;
  }

  // ── reads ───────────────────────────────────────────────────────────────

  async list(user: AccessTokenPayload) {
    const { actor, people } = await this.context(user);
    const rows = await this.prisma.lexReview.findMany({
      where: { organizationId: user.organizationId },
      include: INCLUDE,
      orderBy: [{ periodEnd: 'desc' }, { code: 'asc' }],
    });
    return rows
      .filter((r) => canReadReview(actor, r))
      .map((r) => this.summary(r, actor, people));
  }

  async get(user: AccessTokenPayload, id: string) {
    const { actor, people } = await this.context(user);
    const r = await this.load(user.organizationId, id);
    if (!canReadReview(actor, r))
      throw new NotFoundException('Review not found.');
    const history = await this.prisma.lexDevelopmentEvent.findMany({
      where: {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
      },
      orderBy: { createdAt: 'asc' },
      select: { action: true, note: true, actorId: true, createdAt: true },
    });
    let factsChanged: boolean | null = null;
    if (r.status !== 'APPROVED') {
      try {
        const plan = await this.plan(user.organizationId, r.planDocumentId);
        const fresh = await this.snapshotFor(
          user.organizationId,
          plan,
          ymd(r.periodStart),
          ymd(r.periodEnd),
          r.subjectId,
        );
        factsChanged = fingerprint(fresh) !== fingerprint(r.snapshot);
      } catch {
        factsChanged = null;
      }
    }
    return {
      ...this.summary(r, actor, people),
      reflection: {
        achievements: r.achievements,
        challenges: r.challenges,
        learning: r.learning,
        supportNeeded: r.supportNeeded,
        submittedAt: r.reflectionSubmittedAt?.toISOString() ?? null,
      },
      discussion: {
        recognition: r.recognition,
        findings: r.findings,
        decisions: r.decisions,
        noInputReason: r.noInputReason,
        dataLimitReason: r.dataLimitReason,
        nextReviewDate: r.nextReviewDate ? ymd(r.nextReviewDate) : null,
      },
      snapshot: r.snapshot,
      factsChanged,
      versions: r.versions.map((v) => ({
        version: v.version,
        approvedAt: v.approvedAt.toISOString(),
        approvedById: v.approvedById,
        data: v.data,
      })),
      acknowledgements: r.acknowledgement.map((a) => ({
        version: a.version,
        employeeId: a.employeeId,
        comment: a.comment,
        concern: a.concern,
        acknowledgedAt: a.createdAt.toISOString(),
      })),
      history: history.map((h) => ({
        action: h.action,
        note: h.note,
        actorId: h.actorId,
        at: h.createdAt.toISOString(),
      })),
    };
  }

  private summary(r: ReviewRow, actor: DevelopmentActor, people: People) {
    const me = actor.employeeId;
    const approved = r.versions.at(-1) ?? null;
    const ack = approved
      ? r.acknowledgement.find((a) => a.version === approved.version)
      : undefined;
    const isSubject = !!me && me === r.subjectId;
    const isReviewer = !!me && me === r.reviewerId;
    const open = r.status !== 'APPROVED';
    return {
      id: r.id,
      code: r.code,
      type: r.type,
      status: r.status,
      version: r.version,
      planDocumentId: r.planDocumentId,
      planTitle: (r.snapshot as { planTitle?: string } | null)?.planTitle ?? '',
      departmentId: r.departmentId,
      periodStart: ymd(r.periodStart),
      periodEnd: ymd(r.periodEnd),
      subjectId: r.subjectId,
      subjectName: people.get(r.subjectId)?.name ?? '',
      reviewerId: r.reviewerId,
      reviewerName: people.get(r.reviewerId)?.name ?? '',
      meetingDate: ymd(r.meetingDate),
      reason: r.reason,
      returnReason: r.returnReason,
      approved: approved
        ? {
            version: approved.version,
            approvedAt: approved.approvedAt.toISOString(),
            approvedById: approved.approvedById,
          }
        : null,
      acknowledgement: ack
        ? {
            version: ack.version,
            employeeId: ack.employeeId,
            comment: ack.comment,
            concern: ack.concern,
            acknowledgedAt: ack.createdAt.toISOString(),
          }
        : null,
      linkedActionIds: r.actionLinks.map((l) => l.actionId),
      updatedAt: r.updatedAt.toISOString(),
      can: {
        reflect: open && isSubject && r.status === 'DRAFT',
        submit: open && isSubject && r.status === 'DRAFT',
        review: open && isReviewer,
        returnForClarification: isReviewer && r.status === 'SUBMITTED',
        approve: open && isReviewer,
        revise: isReviewer && r.status === 'APPROVED',
        acknowledge: isSubject && r.status === 'APPROVED' && !!approved && !ack,
        link: open && (isSubject || isReviewer),
      },
    };
  }

  private async load(organizationId: string, id: string): Promise<ReviewRow> {
    const r = await this.prisma.lexReview.findFirst({
      where: { id, organizationId },
      include: INCLUDE,
    });
    if (!r) throw new NotFoundException('Review not found.');
    return r;
  }

  /** Load for a change; hides reviews the caller may not read. */
  private async forChange(user: AccessTokenPayload, id: string) {
    const actor = await this.sources.actor(user);
    const r = await this.load(user.organizationId, id);
    if (!canReadReview(actor, r))
      throw new NotFoundException('Review not found.');
    return { actor, r };
  }

  private requireReviewer(actor: DevelopmentActor, r: LexReview, what: string) {
    if (!actor.employeeId || actor.employeeId !== r.reviewerId)
      throw new ForbiddenException(`Only the recorded reviewer can ${what}.`);
  }

  private requireOpen(r: LexReview) {
    if (r.status === 'APPROVED')
      throw new ConflictException(
        'This review is approved and locked. Open a revision with a reason to change it.',
      );
  }

  /**
   * Applies a change only if the review is still exactly as it was read: same
   * status, version and last update. Postgres row-locks the review for the rest
   * of the transaction, so a concurrent approve, save or revision either waits
   * and then fails this check, or fails its own. Nothing is written on conflict.
   */
  private async guarded(
    tx: Prisma.TransactionClient,
    r: LexReview,
    status: LexReviewStatus | LexReviewStatus[],
    data: Prisma.LexReviewUpdateManyMutationInput = {},
  ) {
    const moved = await tx.lexReview.updateMany({
      where: {
        id: r.id,
        version: r.version,
        updatedAt: r.updatedAt,
        status: Array.isArray(status) ? { in: status } : status,
      },
      data: { ...data, updatedAt: new Date() },
    });
    if (moved.count !== 1)
      throw new ConflictException(
        'This review changed while you were working. Refresh and try again.',
      );
  }

  // ── changes ─────────────────────────────────────────────────────────────

  async create(user: AccessTokenPayload, dto: CreateReviewDto) {
    const organizationId = user.organizationId;
    const { actor, people } = await this.context(user);
    const plans = await this.sources.plans(organizationId);
    const plan = plans.find((p) => p.documentId === dto.planDocumentId);
    if (plan) {
      const o = planOwners(plan, people);
      if (
        plan.kind === 'INDIVIDUAL' &&
        o.subjectId &&
        o.subjectId === o.reviewerId
      )
        throw new BadRequestException(
          'An employee cannot be their own performance reviewer. Correct the EMS reporting relationship.',
        );
    }
    const e = this.eligible(actor, people, plans).find(
      (x) => x.plan.documentId === dto.planDocumentId,
    );
    if (!e)
      throw new ForbiddenException(
        'You can only start a review on an approved plan where you are the employee or the reviewer, and both are active.',
      );
    if (dto.periodStart > dto.periodEnd)
      throw new BadRequestException(
        'Choose a valid period: the start must be on or before the end.',
      );
    const duplicate = await this.prisma.lexReview.findFirst({
      where: {
        organizationId,
        planDocumentId: dto.planDocumentId,
        periodStart: day(dto.periodStart),
        periodEnd: day(dto.periodEnd),
      },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException(
        'A review already exists for this plan and period. Open it rather than creating a duplicate.',
      );
    const snapshot = await this.snapshotFor(
      organizationId,
      e.plan,
      dto.periodStart,
      dto.periodEnd,
      e.subjectId,
    );
    try {
      const created = await tenantTransaction(
        this.prisma,
        organizationId,
        async (tx) => {
          const n = await tx.lexReview.count({ where: { organizationId } });
          const r = await tx.lexReview.create({
            data: {
              organizationId,
              code: `REV-${pad(n + 1)}`,
              type: e.type,
              planDocumentId: e.plan.documentId,
              departmentId: e.departmentId,
              periodStart: day(dto.periodStart),
              periodEnd: day(dto.periodEnd),
              subjectId: e.subjectId,
              reviewerId: e.reviewerId,
              meetingDate: day(dto.meetingDate),
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
            },
          });
          await logEvent(tx, {
            organizationId,
            entity: 'REVIEW',
            entityId: r.id,
            action: 'Review created',
            actorId: actor.employeeId,
            after: {
              planDocumentId: r.planDocumentId,
              periodStart: dto.periodStart,
              periodEnd: dto.periodEnd,
              reviewerId: r.reviewerId,
            },
          });
          return r;
        },
      );
      return this.get(user, created.id);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'A review already exists for this plan and period, or another review was created at the same time. Refresh and try again.',
        );
      throw error;
    }
  }

  /** The subject's reflection; `submit` sends it to the reviewer. */
  async saveReflection(
    user: AccessTokenPayload,
    id: string,
    dto: UpdateReflectionDto,
    submit: boolean,
  ) {
    const { actor, r } = await this.forChange(user, id);
    this.requireOpen(r);
    if (!actor.employeeId || actor.employeeId !== r.subjectId)
      throw new ForbiddenException(
        'Only the review participant can write the reflection.',
      );
    if (r.status !== 'DRAFT')
      throw new ConflictException(
        'The reflection was submitted. The reviewer can return it for clarification.',
      );
    const data = {
      achievements: clip(dto.achievements),
      challenges: clip(dto.challenges),
      learning: clip(dto.learning),
      supportNeeded: clip(dto.supportNeeded),
    };
    if (submit && !data.achievements && !data.challenges)
      throw new BadRequestException(
        'Describe an achievement or a challenge before submitting your review.',
      );
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(
        tx,
        r,
        'DRAFT',
        submit
          ? {
              ...data,
              status: 'SUBMITTED',
              reflectionSubmittedAt: new Date(),
              returnReason: null,
            }
          : data,
      );
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: submit
          ? 'Participant reflection submitted'
          : 'Reflection saved',
        actorId: actor.employeeId,
      });
    });
    return this.get(user, r.id);
  }

  /** The reviewer's discussion notes and decisions. */
  async saveDiscussion(
    user: AccessTokenPayload,
    id: string,
    dto: UpdateReviewDiscussionDto,
  ) {
    const { actor, r } = await this.forChange(user, id);
    this.requireOpen(r);
    this.requireReviewer(actor, r, 'record the discussion');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(tx, r, OPEN_STATUSES, {
        meetingDate: day(dto.meetingDate),
        recognition: clip(dto.recognition),
        findings: clip(dto.findings),
        decisions: clip(dto.decisions),
        noInputReason: clip(dto.noInputReason),
        dataLimitReason: clip(dto.dataLimitReason),
        nextReviewDate: dto.nextReviewDate ? day(dto.nextReviewDate) : null,
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: 'Review discussion saved',
        actorId: actor.employeeId,
      });
    });
    return this.get(user, r.id);
  }

  async refresh(user: AccessTokenPayload, id: string) {
    const { actor, r } = await this.forChange(user, id);
    this.requireOpen(r);
    this.requireReviewer(actor, r, 'refresh the facts');
    const plan = await this.plan(user.organizationId, r.planDocumentId);
    const snapshot = await this.snapshotFor(
      user.organizationId,
      plan,
      ymd(r.periodStart),
      ymd(r.periodEnd),
      r.subjectId,
    );
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(tx, r, OPEN_STATUSES, {
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: 'Review facts refreshed',
        actorId: actor.employeeId,
        before: r.snapshot,
        after: snapshot,
      });
    });
    return this.get(user, r.id);
  }

  async returnForClarification(
    user: AccessTokenPayload,
    id: string,
    reason: string,
  ) {
    const { actor, r } = await this.forChange(user, id);
    this.requireReviewer(actor, r, 'return a submitted review');
    if (r.status !== 'SUBMITTED')
      throw new ConflictException('Only a submitted review can be returned.');
    const why = clip(reason, 1000);
    if (!why)
      throw new BadRequestException('Explain what needs clarification.');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(tx, r, 'SUBMITTED', {
        status: 'DRAFT',
        returnReason: why,
        reflectionSubmittedAt: null,
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: 'Reflection returned for clarification',
        actorId: actor.employeeId,
        note: why,
      });
    });
    return this.get(user, r.id);
  }

  /** Every reason approval is refused, in the order the prototype checks them. */
  async approvalProblem(
    organizationId: string,
    r: LexReview,
    asOf = today(),
  ): Promise<string | null> {
    if (r.type === 'PERSONAL' && r.subjectId === r.reviewerId)
      return 'Self-review approval is not permitted.';
    if (ymd(r.periodEnd) > asOf)
      return 'The review period is still open. Save a draft now and finalise after it ends.';
    if (ymd(r.meetingDate) > asOf)
      return 'Finalise only after the recorded discussion date.';
    if (!r.findings.trim() || !r.decisions.trim())
      return 'Record the performance discussion and the agreed decisions or support.';
    if (
      r.type === 'PERSONAL' &&
      !r.reflectionSubmittedAt &&
      !r.noInputReason.trim()
    )
      return 'Obtain the employee reflection, or record why it was unavailable.';
    const plan = (await this.sources.plans(organizationId)).find(
      (p) => p.documentId === r.planDocumentId,
    );
    if (!plan) return 'The approved plan is unavailable.';
    const fresh = await this.snapshotFor(
      organizationId,
      plan,
      ymd(r.periodStart),
      ymd(r.periodEnd),
      r.subjectId,
    );
    if (fingerprint(fresh) !== fingerprint(r.snapshot))
      return 'Source results or actions have changed. Refresh facts and review the updated evidence first.';
    if (!fresh.complete && !r.dataLimitReason.trim())
      return 'Some performance data is incomplete. Record the limitation; do not imply a complete score.';
    if (r.nextReviewDate && r.nextReviewDate <= r.meetingDate)
      return 'The next review date must be after the current discussion.';
    return null;
  }

  async approve(user: AccessTokenPayload, id: string) {
    const { actor, r } = await this.forChange(user, id);
    this.requireOpen(r);
    this.requireReviewer(actor, r, 'finalise this review');
    const problem = await this.approvalProblem(user.organizationId, r);
    if (problem) throw new BadRequestException(problem);
    try {
      await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
        // Only one approval wins, and only of the content that was checked.
        await this.guarded(tx, r, OPEN_STATUSES, {
          status: 'APPROVED',
          returnReason: null,
        });
        await tx.lexReviewVersion.create({
          data: {
            reviewId: r.id,
            version: r.version,
            data: reviewContent(r) as unknown as Prisma.InputJsonValue,
            approvedById: actor.employeeId!,
          },
        });
        await logEvent(tx, {
          organizationId: user.organizationId,
          entity: 'REVIEW',
          entityId: r.id,
          action: 'Review approved and locked',
          actorId: actor.employeeId,
          after: { version: r.version },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('This version is already approved.');
      throw error;
    }
    return this.get(user, r.id);
  }

  async revise(user: AccessTokenPayload, id: string, reason: string) {
    const { actor, r } = await this.forChange(user, id);
    this.requireReviewer(actor, r, 'revise this approved review');
    if (r.status !== 'APPROVED')
      throw new ConflictException('Only an approved review can be revised.');
    const why = clip(reason, 1000);
    if (!why)
      throw new BadRequestException('Explain why a revision is needed.');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(tx, r, 'APPROVED', {
        status: 'DRAFT',
        version: r.version + 1,
        reason: why,
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: 'Review revision opened',
        actorId: actor.employeeId,
        note: why,
        before: { version: r.version },
        after: { draftVersion: r.version + 1 },
      });
    });
    return this.get(user, r.id);
  }

  /** Confirms receipt of the approved version (not agreement). */
  async acknowledge(
    user: AccessTokenPayload,
    id: string,
    dto: AcknowledgeReviewDto,
  ) {
    const { actor, r } = await this.forChange(user, id);
    if (!actor.employeeId || actor.employeeId !== r.subjectId)
      throw new ForbiddenException(
        'Only the employee or department review participant can acknowledge the final review.',
      );
    const approved = r.versions.at(-1);
    if (r.status !== 'APPROVED' || !approved)
      throw new ConflictException(
        'Only an approved review can be acknowledged.',
      );
    const comment = clip(dto.comment);
    if (dto.concern && !comment)
      throw new BadRequestException(
        'Explain the concern so the manager can respond.',
      );
    try {
      await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
        await this.guarded(tx, r, 'APPROVED');
        await tx.lexReviewAcknowledgement.create({
          data: {
            reviewId: r.id,
            version: approved.version,
            employeeId: actor.employeeId!,
            comment,
            concern: !!dto.concern,
          },
        });
        await logEvent(tx, {
          organizationId: user.organizationId,
          entity: 'REVIEW',
          entityId: r.id,
          action: dto.concern
            ? 'Review acknowledged with a concern'
            : 'Review acknowledged',
          actorId: actor.employeeId,
          after: { version: approved.version, concern: !!dto.concern },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('This version is already acknowledged.');
      throw error;
    }
    return this.get(user, r.id);
  }

  // ── linked Area 04 actions ──────────────────────────────────────────────

  async linkAction(user: AccessTokenPayload, id: string, actionId: string) {
    const { actor, r } = await this.forChange(user, id);
    this.requireOpen(r);
    if (!isParticipant(actor, r))
      throw new ForbiddenException(
        'Only the review participants can link actions.',
      );
    const action = (await this.sources.actions(user.organizationId)).find(
      (a) => a.id === actionId,
    );
    if (
      !action ||
      action.status === 'CANCELLED' ||
      (action.departmentId !== r.departmentId &&
        !(r.type === 'PERSONAL' && action.ownerId === r.subjectId))
    )
      throw new BadRequestException(
        'Choose an existing action in this department.',
      );
    // Being in the same department is not enough: the caller must already have
    // access to the action, or the link would expose it to the other participant.
    if (
      !canAccessAction(
        actor,
        action,
        await this.sources.people(user.organizationId),
      )
    )
      throw new ForbiddenException('You can only link actions you can see.');
    if (r.actionLinks.some((l) => l.actionId === actionId))
      throw new ConflictException('This action is already linked.');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(tx, r, OPEN_STATUSES);
      await tx.lexDevelopmentActionLink.create({
        data: { reviewId: r.id, actionId },
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: 'Existing action linked',
        actorId: actor.employeeId,
        after: { actionId },
      });
    });
    return this.get(user, r.id);
  }

  async unlinkAction(user: AccessTokenPayload, id: string, actionId: string) {
    const { actor, r } = await this.forChange(user, id);
    this.requireOpen(r);
    if (!isParticipant(actor, r))
      throw new ForbiddenException(
        'Only the review participants can unlink actions.',
      );
    if (!r.actionLinks.some((l) => l.actionId === actionId))
      throw new NotFoundException('This action is not linked.');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await this.guarded(tx, r, OPEN_STATUSES);
      await tx.lexDevelopmentActionLink.deleteMany({
        where: { reviewId: r.id, actionId },
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'REVIEW',
        entityId: r.id,
        action: 'Action unlinked',
        actorId: actor.employeeId,
        before: { actionId },
      });
    });
    return this.get(user, r.id);
  }
}

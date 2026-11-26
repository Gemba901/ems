import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LexCoachingRecord } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { tenantTransaction } from 'src/prisma/tenant-transaction';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { ReviewsDevelopmentSources } from '../reviews-development.sources';
import {
  isParticipant,
  today,
  type DevelopmentActor,
  type People,
} from '../development-scope';
import { isUniqueViolation, logEvent, pad } from '../development-events';
import { planOwners } from '../reviews/review-facts';
import type {
  CreateCoachingDto,
  UpdateCoachingDto,
} from '../dto/reviews-development.dto';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const clip = (v: string | undefined, max = 2500) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

type CoachingRow = LexCoachingRecord & { actionLinks: { actionId: string }[] };

/**
 * 06.02 Recognition, feedback and coaching between formal reviews. Private to
 * its two participants; no approval step. Each writes only their own part.
 */
@Injectable()
export class CoachingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: ReviewsDevelopmentSources,
  ) {}

  private async context(user: AccessTokenPayload) {
    const [actor, people] = await Promise.all([
      this.sources.actor(user),
      this.sources.people(user.organizationId),
    ]);
    return { actor, people };
  }

  private view(r: CoachingRow, actor: DevelopmentActor, people: People) {
    const me = actor.employeeId;
    return {
      id: r.id,
      code: r.code,
      kind: r.kind,
      planDocumentId: r.planDocumentId,
      departmentId: r.departmentId,
      subjectId: r.subjectId,
      subjectName: people.get(r.subjectId)?.name ?? '',
      reviewerId: r.reviewerId,
      reviewerName: people.get(r.reviewerId)?.name ?? '',
      date: ymd(r.date),
      topic: r.topic,
      relatesTo: r.relatesTo,
      notes: r.notes,
      support: r.support,
      response: r.response,
      linkedActionIds: r.actionLinks.map((l) => l.actionId),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      can: {
        editNotes: me === r.reviewerId,
        respond: me === r.subjectId,
        link: true,
      },
    };
  }

  /** Records the caller takes part in (participants only — never managers or admins). */
  async list(user: AccessTokenPayload) {
    const { actor, people } = await this.context(user);
    if (!actor.employeeId) return [];
    const rows = await this.prisma.lexCoachingRecord.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [{ subjectId: actor.employeeId }, { reviewerId: actor.employeeId }],
      },
      include: { actionLinks: { select: { actionId: true } } },
      orderBy: [{ date: 'desc' }, { code: 'desc' }],
    });
    return rows.map((r) => this.view(r, actor, people));
  }

  private async forParticipant(user: AccessTokenPayload, id: string) {
    const { actor, people } = await this.context(user);
    const r = await this.prisma.lexCoachingRecord.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { actionLinks: { select: { actionId: true } } },
    });
    if (!r || !isParticipant(actor, r))
      throw new NotFoundException('Discussion not found.');
    return { actor, people, r };
  }

  async get(user: AccessTokenPayload, id: string) {
    const { actor, people, r } = await this.forParticipant(user, id);
    return this.view(r, actor, people);
  }

  async create(user: AccessTokenPayload, dto: CreateCoachingDto) {
    const organizationId = user.organizationId;
    const { actor, people } = await this.context(user);
    const plan = (await this.sources.plans(organizationId)).find(
      (p) => p.documentId === dto.planDocumentId,
    );
    // Coaching is between an employee and their manager: individual plans only.
    const o =
      plan && plan.kind === 'INDIVIDUAL' ? planOwners(plan, people) : null;
    if (
      !plan ||
      !o?.subjectId ||
      !o.reviewerId ||
      o.subjectId === o.reviewerId ||
      !actor.employeeId ||
      !actor.active ||
      !people.get(o.subjectId)?.active ||
      !people.get(o.reviewerId)?.active ||
      !isParticipant(actor, {
        ...o,
        subjectId: o.subjectId,
        reviewerId: o.reviewerId,
      })
    )
      throw new ForbiddenException(
        'Select an approved individual plan where you are the employee or their manager.',
      );
    if (dto.date > today())
      throw new BadRequestException(
        'The discussion date cannot be in the future.',
      );
    const topic = clip(dto.topic, 180);
    const notes = clip(dto.notes);
    if (!topic || !notes)
      throw new BadRequestException(
        'Enter the topic and the discussion notes.',
      );
    const relatesTo = dto.relatesTo || 'role';
    const valid =
      relatesTo === 'role' ||
      plan.goals.some((g) => relatesTo === `goal:${g.id}`) ||
      plan.assignments.some((a) => relatesTo === `kpi:${a.id}`);
    if (!valid)
      throw new BadRequestException(
        'Select a valid related goal, KPI or responsibility from this plan.',
      );
    const manager = actor.employeeId === o.reviewerId;
    const support = clip(dto.support, 2000);
    try {
      const created = await tenantTransaction(
        this.prisma,
        organizationId,
        async (tx) => {
          const n = await tx.lexCoachingRecord.count({
            where: { organizationId },
          });
          const r = await tx.lexCoachingRecord.create({
            data: {
              organizationId,
              code: `COACH-${pad(n + 1)}`,
              kind: dto.kind,
              planDocumentId: plan.documentId,
              departmentId: o.departmentId,
              subjectId: o.subjectId,
              reviewerId: o.reviewerId!,
              date: new Date(`${dto.date}T00:00:00.000Z`),
              topic,
              relatesTo,
              // Each participant's words stay their own.
              notes: manager ? notes : '',
              support: manager ? support : '',
              response: manager
                ? ''
                : notes + (support ? `\nRequested support: ${support}` : ''),
            },
          });
          await logEvent(tx, {
            organizationId,
            entity: 'COACHING',
            entityId: r.id,
            action: manager
              ? 'Coaching / feedback recorded'
              : 'Employee discussion input recorded',
            actorId: actor.employeeId,
          });
          return r;
        },
      );
      return this.get(user, created.id);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Another discussion was saved at the same time. Try again.',
        );
      throw error;
    }
  }

  async update(user: AccessTokenPayload, id: string, dto: UpdateCoachingDto) {
    const { actor, r } = await this.forParticipant(user, id);
    const data: Partial<
      Pick<LexCoachingRecord, 'notes' | 'support' | 'response'>
    > = {};
    if (actor.employeeId === r.reviewerId) {
      if (dto.notes !== undefined) data.notes = clip(dto.notes);
      if (dto.support !== undefined) data.support = clip(dto.support);
    }
    if (actor.employeeId === r.subjectId && dto.response !== undefined)
      data.response = clip(dto.response);
    if (!Object.keys(data).length)
      throw new ForbiddenException(
        'You can only change your own part of this discussion.',
      );
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await tx.lexCoachingRecord.update({ where: { id: r.id }, data });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'COACHING',
        entityId: r.id,
        action: 'Discussion updated',
        actorId: actor.employeeId,
      });
    });
    return this.get(user, r.id);
  }

  async linkAction(user: AccessTokenPayload, id: string, actionId: string) {
    const { actor, r } = await this.forParticipant(user, id);
    const action = (await this.sources.actions(user.organizationId)).find(
      (a) => a.id === actionId,
    );
    if (
      !action ||
      action.status === 'CANCELLED' ||
      (action.departmentId !== r.departmentId && action.ownerId !== r.subjectId)
    )
      throw new BadRequestException(
        'Choose an existing action in this department.',
      );
    if (r.actionLinks.some((l) => l.actionId === actionId))
      throw new ConflictException('This action is already linked.');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await tx.lexDevelopmentActionLink.create({
        data: { coachingId: r.id, actionId },
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'COACHING',
        entityId: r.id,
        action: 'Existing action linked',
        actorId: actor.employeeId,
        after: { actionId },
      });
    });
    return this.get(user, r.id);
  }

  async unlinkAction(user: AccessTokenPayload, id: string, actionId: string) {
    const { actor, r } = await this.forParticipant(user, id);
    if (!r.actionLinks.some((l) => l.actionId === actionId))
      throw new NotFoundException('This action is not linked.');
    await tenantTransaction(this.prisma, user.organizationId, async (tx) => {
      await tx.lexDevelopmentActionLink.deleteMany({
        where: { coachingId: r.id, actionId },
      });
      await logEvent(tx, {
        organizationId: user.organizationId,
        entity: 'COACHING',
        entityId: r.id,
        action: 'Action unlinked',
        actorId: actor.employeeId,
        before: { actionId },
      });
    });
    return this.get(user, r.id);
  }
}

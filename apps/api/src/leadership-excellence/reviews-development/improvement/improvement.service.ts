import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { tenantTransaction } from 'src/prisma/tenant-transaction';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { ReviewsDevelopmentSources } from '../reviews-development.sources';
import {
  canAssessAction,
  canReadReview,
  canSeeAction,
  isParticipant,
} from '../development-scope';
import { logEvent } from '../development-events';
import type { RecordEffectivenessDto } from '../dto/reviews-development.dto';

const clip = (v: string | undefined, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

/**
 * 06.03 Did a checked action actually help? Implementation is confirmed in
 * Area 04 (status VERIFIED); effectiveness is a separate decision recorded here
 * by an independent checker. KPI results are never changed.
 */
@Injectable()
export class ImprovementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: ReviewsDevelopmentSources,
  ) {}

  /** Actions the caller may see, with their check, effectiveness and links. */
  async list(user: AccessTokenPayload) {
    const organizationId = user.organizationId;
    const [actor, people, actions, assessments, links] = await Promise.all([
      this.sources.actor(user),
      this.sources.people(organizationId),
      this.sources.actions(organizationId),
      this.prisma.lexActionEffectiveness.findMany({
        where: { organizationId },
      }),
      this.prisma.lexDevelopmentActionLink.findMany({
        where: {
          OR: [
            { review: { organizationId } },
            { coaching: { organizationId } },
          ],
        },
        include: {
          review: {
            select: {
              id: true,
              code: true,
              type: true,
              subjectId: true,
              reviewerId: true,
              departmentId: true,
            },
          },
          coaching: {
            select: {
              id: true,
              code: true,
              subjectId: true,
              reviewerId: true,
              departmentId: true,
            },
          },
        },
      }),
    ]);
    const byAction = new Map(assessments.map((e) => [e.actionId, e]));
    return actions.flatMap((a) => {
      const e = byAction.get(a.id);
      const linked = links.filter((l) => l.actionId === a.id);
      const linkedHere = linked.some(
        (l) =>
          (l.review && canReadReview(actor, l.review)) ||
          (l.coaching && isParticipant(actor, l.coaching)),
      );
      const canAssess =
        a.status === 'VERIFIED' && canAssessAction(actor, a, people);
      if (!canSeeAction(actor, a, e?.assessedById) && !linkedHere && !canAssess)
        return [];
      return [
        {
          id: a.id,
          documentId: a.documentId ?? null,
          title: a.title,
          ownerId: a.ownerId,
          ownerName: people.get(a.ownerId)?.name ?? '',
          departmentId: a.departmentId,
          goalId: a.goalId,
          goalTitle: a.goalTitle,
          dueAt: a.dueAt,
          status: a.status,
          expectedResult: a.expectedResult,
          evidence: a.evidence,
          checkedById: a.checkedById,
          checkedAt: a.checkedAt,
          effectiveness: e
            ? {
                id: e.id,
                status: e.status,
                note: e.note,
                evidence: e.evidence,
                assessedById: e.assessedById,
                assessedAt: e.assessedAt.toISOString(),
              }
            : null,
          linkedFrom: linked.flatMap(
            (l): { kind: 'REVIEW' | 'COACHING'; id: string; code: string }[] =>
              l.review && canReadReview(actor, l.review)
                ? [
                    {
                      kind: 'REVIEW' as const,
                      id: l.review.id,
                      code: l.review.code,
                    },
                  ]
                : l.coaching && isParticipant(actor, l.coaching)
                  ? [
                      {
                        kind: 'COACHING' as const,
                        id: l.coaching.id,
                        code: l.coaching.code,
                      },
                    ]
                  : [],
          ),
          canAssess,
        },
      ];
    });
  }

  async record(
    user: AccessTokenPayload,
    actionId: string,
    dto: RecordEffectivenessDto,
  ) {
    const organizationId = user.organizationId;
    const [actor, people, actions] = await Promise.all([
      this.sources.actor(user),
      this.sources.people(organizationId),
      this.sources.actions(organizationId),
    ]);
    const a = actions.find((x) => x.id === actionId);
    if (!a) throw new NotFoundException('Action not found.');
    if (!canAssessAction(actor, a, people))
      throw new ForbiddenException(
        'Only an authorised independent checker can assess this action.',
      );
    if (a.status !== 'VERIFIED')
      throw new ConflictException(
        'Check implementation first. Effectiveness is a separate decision.',
      );
    const note = clip(dto.note, 2500);
    const evidence = clip(dto.evidence, 1500);
    if (!note || !evidence)
      throw new BadRequestException(
        'Explain the outcome and record the evidence used.',
      );
    await tenantTransaction(this.prisma, organizationId, async (tx) => {
      const before = await tx.lexActionEffectiveness.findUnique({
        where: { organizationId_actionId: { organizationId, actionId } },
      });
      const data = {
        status: dto.status,
        note,
        evidence,
        assessedById: actor.employeeId!,
        assessedAt: new Date(),
      };
      const row = await tx.lexActionEffectiveness.upsert({
        where: { organizationId_actionId: { organizationId, actionId } },
        create: { organizationId, actionId, ...data },
        update: data,
      });
      await logEvent(tx, {
        organizationId,
        entity: 'EFFECTIVENESS',
        entityId: row.id,
        action: 'Action effectiveness assessed',
        actorId: actor.employeeId,
        before: before
          ? {
              status: before.status,
              note: before.note,
              evidence: before.evidence,
            }
          : null,
        after: { actionId, status: row.status, note, evidence },
      });
    });
    return (await this.list(user)).find((x) => x.id === actionId);
  }
}

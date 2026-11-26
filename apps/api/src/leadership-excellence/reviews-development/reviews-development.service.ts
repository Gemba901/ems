import { Injectable } from '@nestjs/common';
import type { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import type {
  ApprovedReviewSummary,
  CoachingMetadata,
  EffectivenessAssessment,
  ReviewReadFilter,
  ReviewsDevelopmentProvider,
} from '../common/contracts';
import { ReviewsDevelopmentSources } from './reviews-development.sources';
import {
  canReadReview,
  canSeeAction,
  canSeeMetadata,
  isParticipant,
} from './development-scope';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const endOfDay = (s: string) => new Date(`${s}T23:59:59.999Z`);

interface ApprovedData {
  meetingDate?: string;
  achievements?: string;
  challenges?: string;
  learning?: string;
  supportNeeded?: string;
  recognition?: string;
  findings?: string;
  decisions?: string;
  noInputReason?: string;
  dataLimitReason?: string;
  nextReviewDate?: string | null;
  snapshot?: { planVersion?: number } & Record<string, unknown>;
}

/**
 * What Area 06 exports to Area 07 (dashboards and reports). Approved review
 * versions only. Every read applies Area 06's permission rules for the given
 * user; confidential content (personal review content, coaching topic, notes,
 * support and response) never leaves for anyone but the two participants.
 */
@Injectable()
export class ReviewsDevelopmentService implements ReviewsDevelopmentProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: ReviewsDevelopmentSources,
  ) {}

  async listApprovedReviews(
    user: AccessTokenPayload,
    filter: ReviewReadFilter = {},
  ): Promise<ApprovedReviewSummary[]> {
    const actor = await this.sources.actor(user);
    const where: Prisma.LexReviewWhereInput = {
      organizationId: user.organizationId,
      versions: { some: {} },
    };
    if (filter.periodStart) where.periodEnd = { gte: day(filter.periodStart) };
    if (filter.periodEnd) where.periodStart = { lte: day(filter.periodEnd) };
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.employeeId)
      where.OR = [
        { subjectId: filter.employeeId },
        { reviewerId: filter.employeeId },
      ];
    const rows = await this.prisma.lexReview.findMany({
      where,
      include: {
        versions: { orderBy: { version: 'asc' } },
        acknowledgement: true,
        actionLinks: { select: { actionId: true } },
      },
      orderBy: [{ periodEnd: 'desc' }, { code: 'asc' }],
    });
    return rows.flatMap((r) => {
      if (!canSeeMetadata(actor, r)) return [];
      const v = r.versions.at(-1)!;
      const data = (v.data ?? {}) as ApprovedData;
      const readable = canReadReview(actor, r);
      const participant = isParticipant(actor, r);
      const ack = r.acknowledgement.find((a) => a.version === v.version);
      return [
        {
          id: r.id,
          code: r.code,
          type: r.type,
          version: v.version,
          revisionInProgress: r.status !== 'APPROVED',
          planDocumentId: r.planDocumentId,
          planVersion: data.snapshot?.planVersion ?? null,
          departmentId: r.departmentId,
          periodStart: ymd(r.periodStart),
          periodEnd: ymd(r.periodEnd),
          subjectId: r.subjectId,
          reviewerId: r.reviewerId,
          meetingDate: data.meetingDate ?? ymd(r.meetingDate),
          nextReviewDate: data.nextReviewDate ?? null,
          approvedById: v.approvedById,
          approvedAt: v.approvedAt.toISOString(),
          acknowledgement: ack
            ? {
                version: ack.version,
                employeeId: ack.employeeId,
                acknowledgedAt: ack.createdAt.toISOString(),
                concern: ack.concern,
                comment: participant ? ack.comment : null,
              }
            : null,
          linkedActionIds: r.actionLinks.map((l) => l.actionId),
          restricted: !readable,
          content: readable
            ? {
                achievements: data.achievements ?? '',
                challenges: data.challenges ?? '',
                learning: data.learning ?? '',
                supportNeeded: data.supportNeeded ?? '',
                recognition: data.recognition ?? '',
                findings: data.findings ?? '',
                decisions: data.decisions ?? '',
                noInputReason: data.noInputReason ?? '',
                dataLimitReason: data.dataLimitReason ?? '',
                snapshot: data.snapshot ?? null,
              }
            : null,
        },
      ];
    });
  }

  async listCoachingMetadata(
    user: AccessTokenPayload,
    filter: ReviewReadFilter = {},
  ): Promise<CoachingMetadata[]> {
    const actor = await this.sources.actor(user);
    const where: Prisma.LexCoachingRecordWhereInput = {
      organizationId: user.organizationId,
    };
    if (filter.periodStart || filter.periodEnd)
      where.date = {
        ...(filter.periodStart ? { gte: day(filter.periodStart) } : {}),
        ...(filter.periodEnd ? { lte: day(filter.periodEnd) } : {}),
      };
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.employeeId)
      where.OR = [
        { subjectId: filter.employeeId },
        { reviewerId: filter.employeeId },
      ];
    const rows = await this.prisma.lexCoachingRecord.findMany({
      where,
      include: { actionLinks: { select: { actionId: true } } },
      orderBy: [{ date: 'desc' }, { code: 'asc' }],
    });
    return rows
      .filter((r) => canSeeMetadata(actor, r))
      .map((r) => ({
        id: r.id,
        code: r.code,
        kind: r.kind,
        planDocumentId: r.planDocumentId,
        departmentId: r.departmentId,
        subjectId: r.subjectId,
        reviewerId: r.reviewerId,
        date: ymd(r.date),
        relatesTo: r.relatesTo,
        hasResponse: !!r.response.trim(),
        linkedActionIds: r.actionLinks.map((l) => l.actionId),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
  }

  async listEffectiveness(
    user: AccessTokenPayload,
    filter: ReviewReadFilter = {},
  ): Promise<EffectivenessAssessment[]> {
    const organizationId = user.organizationId;
    const where: Prisma.LexActionEffectivenessWhereInput = { organizationId };
    if (filter.periodStart || filter.periodEnd)
      where.assessedAt = {
        ...(filter.periodStart ? { gte: day(filter.periodStart) } : {}),
        ...(filter.periodEnd ? { lte: endOfDay(filter.periodEnd) } : {}),
      };
    const [actor, actions, rows] = await Promise.all([
      this.sources.actor(user),
      this.sources.actions(organizationId),
      this.prisma.lexActionEffectiveness.findMany({
        where,
        orderBy: { assessedAt: 'desc' },
      }),
    ]);
    const versions = rows.length
      ? await this.prisma.lexDevelopmentEvent.groupBy({
          by: ['entityId'],
          where: {
            organizationId,
            entity: 'EFFECTIVENESS',
            entityId: { in: rows.map((r) => r.id) },
          },
          _count: { _all: true },
        })
      : [];
    const versionOf = new Map(versions.map((v) => [v.entityId, v._count._all]));
    const byId = new Map(actions.map((a) => [a.id, a]));
    return rows.flatMap((e) => {
      const a = byId.get(e.actionId);
      const facts = a ?? {
        ownerId: '',
        departmentId: null,
        goalOwnerId: null,
      };
      if (!canSeeAction(actor, facts, e.assessedById)) return [];
      if (filter.departmentId && facts.departmentId !== filter.departmentId)
        return [];
      if (
        filter.employeeId &&
        facts.ownerId !== filter.employeeId &&
        e.assessedById !== filter.employeeId
      )
        return [];
      return [
        {
          id: e.id,
          actionId: e.actionId,
          actionDocumentId: a?.documentId ?? null,
          actionTitle: a?.title ?? '',
          ownerId: facts.ownerId,
          departmentId: facts.departmentId,
          status: e.status,
          note: e.note,
          evidence: e.evidence,
          assessedById: e.assessedById,
          assessedAt: e.assessedAt.toISOString(),
          version: Math.max(1, versionOf.get(e.id) ?? 1),
        },
      ];
    });
  }
}

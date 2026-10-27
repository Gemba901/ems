import { Injectable } from '@nestjs/common';
import { Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, toDbDate } from 'src/work/work-date';
import { OverviewQueryDto } from '../dto/five-s.dto';
import { syncAreasFromProfiles } from '../five-s-area-sync';
import { FiveSAccessService } from '../five-s-access.service';
import { AUDIT_RESULT_SELECT, REPORTABLE_AUDIT_WHERE, buildAreaSummaries, toAuditResult } from '../five-s-summary';
import { TEMPLATE_LABELS } from '../five-s-template';

// Module overview. Only SUBMITTED audits made with the production/shopfloor checksheet are counted.
// Areas without one are "Not assessed" and never counted as zero. The cross-area figure is an
// equal-weight mean of each assessed area's latest level, and is labelled as such.

@Injectable()
export class OverviewService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async overview(user: AccessTokenPayload, query: OverviewQueryDto) {
        const actor = await this.access.resolveActor(user);
        await syncAreasFromProfiles(this.prisma, actor.organizationId);
        const today = this.access.today(actor);
        const status = query.status ?? 'active';
        const areaWhere: Prisma.FiveSAreaWhereInput = {
            AND: [
                this.access.visibleAreaWhere(actor),
                status === 'all' ? {} : { isActive: status === 'active' },
                query.areaId ? { id: query.areaId } : {},
                query.departmentId ? { departmentId: query.departmentId } : {},
                query.ownerId ? { ownerId: query.ownerId } : {},
            ],
        };

        const areas = await buildAreaSummaries(this.prisma, areaWhere, today);
        const from = query.from ?? addDays(today, -365);
        const to = query.to ?? today;

        const history = areas.length
            ? await this.prisma.fiveSAudit.findMany({
                  where: {
                      areaId: { in: areas.map((a) => a.id) },
                      ...REPORTABLE_AUDIT_WHERE,
                      auditDate: { gte: toDbDate(from), lte: toDbDate(to) },
                  },
                  orderBy: [{ auditDate: 'asc' }, { submittedAt: 'asc' }],
                  take: 500,
                  select: AUDIT_RESULT_SELECT,
              })
            : [];
        const areaNames = new Map(areas.map((a) => [a.id, a.name]));

        const assessed = areas.filter((a) => a.latest);
        const mean = assessed.length ? assessed.reduce((sum, a) => sum + a.latest!.level, 0) / assessed.length : null;
        const sum = (pick: (a: (typeof areas)[number]) => number) => areas.reduce((total, a) => total + pick(a), 0);

        return {
            today,
            method: TEMPLATE_LABELS[REPORTABLE_AUDIT_WHERE.template],
            historyRange: { from, to },
            areas,
            totals: {
                areas: areas.length,
                assessed: assessed.length,
                notAssessed: areas.length - assessed.length,
                targetMet: assessed.filter((a) => a.targetMet).length,
                targetNotMet: assessed.filter((a) => a.targetMet === false).length,
                openActions: sum((a) => a.counts.openActions),
                overdueActions: sum((a) => a.counts.overdueActions),
                awaitingVerification: sum((a) => a.counts.awaitingVerification),
                actionsWithoutDueDate: sum((a) => a.counts.noDueDate),
                pendingRedTags: sum((a) => a.counts.pendingRedTags),
                auditsOverdue: areas.filter((a) => a.isActive && a.auditDue.state === 'OVERDUE').length,
                auditsDueSoon: areas.filter((a) => a.isActive && a.auditDue.state === 'DUE_SOON').length,
                neverAudited: areas.filter((a) => a.isActive && a.auditDue.state === 'NEVER_AUDITED').length,
            },
            crossAreaMean: {
                label: 'Equal-weight mean of each assessed area\'s latest 5S level',
                value: mean == null ? null : Math.round(mean * 100) / 100,
                assessedAreas: assessed.length,
                excludedNotAssessed: areas.length - assessed.length,
            },
            auditHistory: history.map((h) => ({ ...toAuditResult(h), area: { id: h.areaId, name: areaNames.get(h.areaId) ?? '' } })),
        };
    }
}

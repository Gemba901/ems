import { Injectable } from '@nestjs/common';
import { FiveSPractice, FiveSRedTagReason, FiveSRedTagStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, toDbDate } from 'src/work/work-date';
import { OverviewQueryDto } from '../dto/five-s.dto';
import { syncAreasFromProfiles } from '../five-s-area-sync';
import { FiveSAccessService } from '../five-s-access.service';
import { dateOnly } from '../five-s-records';
import { emptyPracticePoints, PracticePoints } from '../five-s-scoring';
import { AUDIT_RESULT_SELECT, REPORTABLE_AUDIT_WHERE, buildAreaSummaries, toAuditResult } from '../five-s-summary';
import { CURRENT_TEMPLATE, PRACTICE_ORDER, TEMPLATE_LABELS, checkpointsFor } from '../five-s-template';

// 5S analytics for the selected period, broken down by department.
//
// Same reporting rules as the overview: only SUBMITTED audits made with the current checksheet
// count, and areas without one in the period are "Not assessed", never zero. An area's profile is
// its latest audit in the period; department and company figures are equal-weight means of those
// area profiles, so an area audited weekly does not outweigh one audited monthly.
//
// Conformance % turns abnormality points into "higher is better" for radar charts:
// (20 - points) / 20 per S. It is a presentation of the same points, not a separate score.

const POINTS_PER_PRACTICE = 20;
const NO_DEPARTMENT = 'none';

type Profile = { meanLevel: number | null; meanPoints: PracticePoints | null; conformance: PracticePoints | null; assessed: number };

function round(value: number, places = 2): number {
    const f = 10 ** places;
    return Math.round(value * f) / f;
}

function profileOf(latest: { level: number; points: PracticePoints }[]): Profile {
    if (latest.length === 0) return { meanLevel: null, meanPoints: null, conformance: null, assessed: 0 };
    const meanPoints = emptyPracticePoints();
    const conformance = emptyPracticePoints();
    for (const practice of PRACTICE_ORDER) {
        const mean = latest.reduce((sum, a) => sum + a.points[practice], 0) / latest.length;
        meanPoints[practice] = round(mean, 1);
        conformance[practice] = round(((POINTS_PER_PRACTICE - mean) / POINTS_PER_PRACTICE) * 100, 0);
    }
    return {
        meanLevel: round(latest.reduce((sum, a) => sum + a.level, 0) / latest.length),
        meanPoints,
        conformance,
        assessed: latest.length,
    };
}

@Injectable()
export class AnalyticsService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async analytics(user: AccessTokenPayload, query: OverviewQueryDto) {
        const actor = await this.access.resolveActor(user);
        await syncAreasFromProfiles(this.prisma, actor.organizationId);
        const today = this.access.today(actor);
        const status = query.status ?? 'active';
        const from = query.from ?? addDays(today, -365);
        const to = query.to ?? today;
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
        const areaIds = areas.map((a) => a.id);
        const inPeriod = { gte: toDbDate(from), lte: toDbDate(to) };

        const [audits, redTags] = areaIds.length
            ? await Promise.all([
                  this.prisma.fiveSAudit.findMany({
                      where: { areaId: { in: areaIds }, ...REPORTABLE_AUDIT_WHERE, auditDate: inPeriod },
                      orderBy: [{ auditDate: 'asc' }, { submittedAt: 'asc' }],
                      select: AUDIT_RESULT_SELECT,
                  }),
                  this.prisma.fiveSRedTag.findMany({
                      where: { areaId: { in: areaIds }, raisedOn: inPeriod },
                      select: { areaId: true, reason: true, status: true },
                  }),
              ])
            : [[], []];

        const responseSums = audits.length
            ? await this.prisma.fiveSAuditResponse.groupBy({
                  by: ['checkpointNo'],
                  where: { auditId: { in: audits.map((a) => a.id) } },
                  _sum: { locationCount: true },
              })
            : [];
        const findingCounts = audits.length
            ? await this.prisma.fiveSAuditResponse.groupBy({
                  by: ['checkpointNo'],
                  where: { auditId: { in: audits.map((a) => a.id) }, locationCount: { gt: 0 } },
                  _count: { _all: true },
              })
            : [];

        // Audits arrive oldest first, so the last one seen per area is its latest in the period.
        const results = audits.map((a) => ({ areaId: a.areaId, ...toAuditResult(a) }));
        const latestByArea = new Map(results.map((r) => [r.areaId, r]));

        const deptKey = (dept: { id: string } | null) => dept?.id ?? NO_DEPARTMENT;
        const deptOfArea = new Map(areas.map((a) => [a.id, deptKey(a.department)]));
        const deptNames = new Map<string, string>();
        for (const a of areas) deptNames.set(deptKey(a.department), a.department?.name ?? 'No department');

        const departments = [...deptNames.entries()]
            .map(([key, name]) => {
                const deptAreas = areas.filter((a) => deptKey(a.department) === key);
                const latest = deptAreas.map((a) => latestByArea.get(a.id)).filter((r) => r != null);
                const latestIds = new Set(latest.map((r) => r.areaId));
                const tags = redTags.filter((t) => deptOfArea.get(t.areaId) === key);
                return {
                    key,
                    id: key === NO_DEPARTMENT ? null : key,
                    name,
                    areas: deptAreas.length,
                    notAssessed: deptAreas.length - latest.length,
                    ...profileOf(latest),
                    targetMet: deptAreas.filter((a) => latestIds.has(a.id) && Math.round(latestByArea.get(a.id)!.level * 10) >= Math.round(a.targetLevel * 10)).length,
                    audits: results.filter((r) => deptOfArea.get(r.areaId) === key).length,
                    openActions: deptAreas.reduce((sum, a) => sum + a.counts.openActions, 0),
                    overdueActions: deptAreas.reduce((sum, a) => sum + a.counts.overdueActions, 0),
                    awaitingVerification: deptAreas.reduce((sum, a) => sum + a.counts.awaitingVerification, 0),
                    pendingRedTags: deptAreas.reduce((sum, a) => sum + a.counts.pendingRedTags, 0),
                    redTagsRaised: tags.length,
                };
            })
            // Assessed departments first, best level first; "No department" last among equals.
            .sort((a, b) => (b.meanLevel ?? -1) - (a.meanLevel ?? -1) || Number(a.id == null) - Number(b.id == null) || a.name.localeCompare(b.name));

        const areaProfiles = areas
            .filter((a) => latestByArea.has(a.id))
            .map((a) => {
                const latest = latestByArea.get(a.id)!;
                return {
                    id: a.id,
                    name: a.name,
                    departmentKey: deptKey(a.department),
                    departmentName: deptNames.get(deptKey(a.department))!,
                    auditDate: latest.auditDate,
                    level: latest.level,
                    targetLevel: a.targetLevel,
                    points: latest.points,
                    totalPoints: latest.totalPoints,
                    ...profileOf([latest]),
                };
            });

        // Monthly trend: every audit in the month counts, per area and per department.
        const months = new Map<string, typeof results>();
        for (const r of results) {
            const month = r.auditDate.slice(0, 7);
            months.set(month, [...(months.get(month) ?? []), r]);
        }
        const trend = [...months.entries()].map(([month, rows]) => {
            const byDept: Record<string, number> = {};
            for (const key of new Set(rows.map((r) => deptOfArea.get(r.areaId)!))) {
                const deptRows = rows.filter((r) => deptOfArea.get(r.areaId) === key);
                byDept[key] = round(deptRows.reduce((sum, r) => sum + r.level, 0) / deptRows.length);
            }
            return {
                month,
                audits: rows.length,
                meanLevel: round(rows.reduce((sum, r) => sum + r.level, 0) / rows.length),
                meanTotalPoints: round(rows.reduce((sum, r) => sum + r.totalPoints, 0) / rows.length, 1),
                byDepartment: byDept,
            };
        });

        const sumByNo = new Map(responseSums.map((r) => [r.checkpointNo, r._sum.locationCount ?? 0]));
        const findingsByNo = new Map(findingCounts.map((r) => [r.checkpointNo, r._count._all]));
        const checkpoints = checkpointsFor(CURRENT_TEMPLATE).map((c) => ({
            no: c.no,
            practice: c.practice as FiveSPractice,
            text: c.text,
            points: sumByNo.get(c.no) ?? 0,
            auditsWithFindings: findingsByNo.get(c.no) ?? 0,
        }));

        const count = <K extends string>(keys: readonly K[], pick: (t: (typeof redTags)[number]) => K) =>
            keys.map((key) => ({ key, count: redTags.filter((t) => pick(t) === key).length }));

        return {
            today,
            method: TEMPLATE_LABELS[CURRENT_TEMPLATE],
            range: { from, to },
            overall: {
                areas: areas.length,
                audits: results.length,
                firstAudit: results.length ? dateOnly(audits[0].auditDate) : null,
                ...profileOf([...latestByArea.values()]),
            },
            departments,
            areaProfiles,
            trend,
            checkpoints,
            redTags: {
                total: redTags.length,
                byReason: count(Object.values(FiveSRedTagReason), (t) => t.reason),
                byStatus: count(Object.values(FiveSRedTagStatus), (t) => t.status),
                byDepartment: departments.map((d) => ({
                    key: d.key,
                    name: d.name,
                    ...Object.fromEntries(
                        Object.values(FiveSRedTagStatus).map((s) => [s, redTags.filter((t) => t.status === s && deptOfArea.get(t.areaId) === d.key).length]),
                    ),
                })),
            },
        };
    }
}

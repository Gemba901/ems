import { FiveSActionStatus, FiveSAuditStatus, FiveSRedTagStatus, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { toDbDate } from 'src/work/work-date';
import { AuditDueState, auditDueState } from './five-s-schedule';
import { CURRENT_TEMPLATE } from './five-s-template';
import { PERSON_SELECT, Person, dateOnly, level, person } from './five-s-records';

// Performance reporting only ever uses SUBMITTED audits made with the current assessment
// method. Drafts and other methods are excluded.
export const REPORTABLE_AUDIT_WHERE = {
    status: FiveSAuditStatus.SUBMITTED,
    template: CURRENT_TEMPLATE,
} satisfies Prisma.FiveSAuditWhereInput;

export const PENDING_RED_TAG_STATUSES: FiveSRedTagStatus[] = [FiveSRedTagStatus.PENDING, FiveSRedTagStatus.DECIDED];

export const AUDIT_RESULT_SELECT = {
    id: true,
    reference: true,
    areaId: true,
    auditDate: true,
    sortPoints: true,
    setInOrderPoints: true,
    shinePoints: true,
    standardizePoints: true,
    sustainPoints: true,
    totalPoints: true,
    levelTenths: true,
    targetLevelTenths: true,
    submittedAt: true,
    auditor: { select: PERSON_SELECT },
} satisfies Prisma.FiveSAuditSelect;

type AuditResultRow = Prisma.FiveSAuditGetPayload<{ select: typeof AUDIT_RESULT_SELECT }>;

export type AuditResultView = {
    id: string;
    reference: string;
    auditDate: string;
    auditor: Person | null;
    points: { SORT: number; SET_IN_ORDER: number; SHINE: number; STANDARDIZE: number; SUSTAIN: number };
    totalPoints: number;
    level: number;
    // The target in force when the audit was submitted.
    targetLevel: number | null;
    targetMet: boolean | null;
    submittedAt: Date | null;
};

export function toAuditResult(row: AuditResultRow): AuditResultView {
    return {
        id: row.id,
        reference: row.reference,
        auditDate: dateOnly(row.auditDate)!,
        auditor: person(row.auditor),
        points: {
            SORT: row.sortPoints ?? 0,
            SET_IN_ORDER: row.setInOrderPoints ?? 0,
            SHINE: row.shinePoints ?? 0,
            STANDARDIZE: row.standardizePoints ?? 0,
            SUSTAIN: row.sustainPoints ?? 0,
        },
        totalPoints: row.totalPoints ?? 0,
        level: level(row.levelTenths)!,
        targetLevel: level(row.targetLevelTenths),
        targetMet: row.targetLevelTenths == null || row.levelTenths == null ? null : row.levelTenths >= row.targetLevelTenths,
        submittedAt: row.submittedAt,
    };
}

export type AreaSummary = {
    id: string;
    name: string;
    isActive: boolean;
    isSample: boolean;
    department: { id: string; name: string } | null;
    owner: Person | null;
    auditFrequency: string;
    targetLevel: number;
    // null means "Not assessed": no submitted audit with the current method.
    latest: AuditResultView | null;
    // Compared with the area's current target.
    targetMet: boolean | null;
    auditDue: { state: AuditDueState; nextDueDate: string | null };
    counts: { openActions: number; overdueActions: number; awaitingVerification: number; noDueDate: number; pendingRedTags: number };
};

const AREA_SELECT = {
    id: true,
    name: true,
    isActive: true,
    isSample: true,
    auditFrequency: true,
    targetLevelTenths: true,
    department: { select: { id: true, name: true } },
    owner: { select: PERSON_SELECT },
} satisfies Prisma.FiveSAreaSelect;

export async function buildAreaSummaries(
    prisma: PrismaService,
    where: Prisma.FiveSAreaWhereInput,
    today: string,
): Promise<AreaSummary[]> {
    const areas = await prisma.fiveSArea.findMany({ where, select: AREA_SELECT, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    if (areas.length === 0) return [];
    const areaIds = areas.map((a) => a.id);

    const [latestAudits, actionGroups, overdueGroups, noDueGroups, tagGroups] = await Promise.all([
        prisma.fiveSAudit.findMany({
            where: { areaId: { in: areaIds }, ...REPORTABLE_AUDIT_WHERE },
            distinct: ['areaId'],
            orderBy: [{ areaId: 'asc' }, { auditDate: 'desc' }, { submittedAt: 'desc' }],
            select: AUDIT_RESULT_SELECT,
        }),
        prisma.fiveSAction.groupBy({
            by: ['areaId', 'status'],
            where: { areaId: { in: areaIds }, status: { not: FiveSActionStatus.VERIFIED } },
            _count: { _all: true },
        }),
        prisma.fiveSAction.groupBy({
            by: ['areaId'],
            where: { areaId: { in: areaIds }, ...overdueActionWhere(today) },
            _count: { _all: true },
        }),
        prisma.fiveSAction.groupBy({
            by: ['areaId'],
            where: { areaId: { in: areaIds }, status: { not: FiveSActionStatus.VERIFIED }, dueDate: null },
            _count: { _all: true },
        }),
        prisma.fiveSRedTag.groupBy({
            by: ['areaId'],
            where: { areaId: { in: areaIds }, status: { in: PENDING_RED_TAG_STATUSES } },
            _count: { _all: true },
        }),
    ]);

    const latestByArea = new Map(latestAudits.map((a) => [a.areaId, toAuditResult(a)]));
    const countFor = <T extends { areaId: string; _count: { _all: number } }>(rows: T[], areaId: string, match?: (row: T) => boolean) =>
        rows.filter((r) => r.areaId === areaId && (!match || match(r))).reduce((sum, r) => sum + r._count._all, 0);

    return areas.map((area) => {
        const latest = latestByArea.get(area.id) ?? null;
        return {
            id: area.id,
            name: area.name,
            isActive: area.isActive,
            isSample: area.isSample,
            department: area.department,
            owner: person(area.owner),
            auditFrequency: area.auditFrequency,
            targetLevel: area.targetLevelTenths / 10,
            latest,
            targetMet: latest ? Math.round(latest.level * 10) >= area.targetLevelTenths : null,
            auditDue: auditDueState(latest?.auditDate ?? null, area.auditFrequency, today),
            counts: {
                openActions: countFor(actionGroups, area.id, (r) => r.status === FiveSActionStatus.OPEN),
                awaitingVerification: countFor(actionGroups, area.id, (r) => r.status === FiveSActionStatus.AWAITING_VERIFICATION),
                overdueActions: countFor(overdueGroups, area.id),
                noDueDate: countFor(noDueGroups, area.id),
                pendingRedTags: countFor(tagGroups, area.id),
            },
        };
    });
}

// Overdue = still open with a due date before today. Actions without a due date are never overdue,
// and actions awaiting verification have had their work done.
export function overdueActionWhere(today: string): Prisma.FiveSActionWhereInput {
    return { status: FiveSActionStatus.OPEN, dueDate: { not: null, lt: toDbDate(today) } };
}

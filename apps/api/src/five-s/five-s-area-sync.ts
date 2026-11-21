import { Logger } from '@nestjs/common';
import { EmploymentStatus } from 'db';
import type { PrismaService } from 'src/prisma/prisma.service';

// Workplace areas are not created by hand: they are the distinct "Work Area / Section" values on
// employee profiles (Employee.section). Each area takes the department most of its people sit in.
// A section nobody holds any more deactivates its area (history kept); one that comes back
// reactivates it. Sample areas are training data and are left alone.

const LEFT_COMPANY: EmploymentStatus[] = [
    EmploymentStatus.RESIGNED,
    EmploymentStatus.TERMINATED,
    EmploymentStatus.RETIRED,
    EmploymentStatus.ABSCONDED,
    EmploymentStatus.CONTRACT_ENDED,
];

// Areas are read on most 5S pages; one sync per company every 30 seconds is plenty.
const SYNC_INTERVAL_MS = 30_000;
const lastSynced = new Map<string, number>();

const logger = new Logger('FiveSAreaSync');

const keyOf = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export async function syncAreasFromProfiles(prisma: PrismaService, organizationId: string, { force = false } = {}) {
    const now = Date.now();
    if (!force && now - (lastSynced.get(organizationId) ?? 0) < SYNC_INTERVAL_MS) return;
    lastSynced.set(organizationId, now);
    try {
        await sync(prisma, organizationId);
    } catch (error) {
        // Never break the page over a sync: show the areas as they are and retry on the next request.
        lastSynced.delete(organizationId);
        logger.error(`Area sync failed for ${organizationId}`, error instanceof Error ? error.stack : String(error));
    }
}

async function sync(prisma: PrismaService, organizationId: string) {
    const [groups, existing] = await Promise.all([
        prisma.employee.groupBy({
            by: ['section', 'departmentId'],
            where: { organizationId, section: { not: null }, employmentStatus: { notIn: LEFT_COMPANY } },
            _count: { _all: true },
        }),
        prisma.fiveSArea.findMany({
            where: { organizationId, isSample: false },
            select: { id: true, name: true, departmentId: true, isActive: true },
        }),
    ]);

    // key -> display name and head count per department
    const sections = new Map<string, { name: string; departments: Map<string | null, number> }>();
    for (const g of groups) {
        const name = g.section!.trim().replace(/\s+/g, ' ');
        if (!name) continue;
        const entry = sections.get(keyOf(name)) ?? { name, departments: new Map() };
        entry.departments.set(g.departmentId, (entry.departments.get(g.departmentId) ?? 0) + g._count._all);
        sections.set(keyOf(name), entry);
    }
    const majorityDepartment = (departments: Map<string | null, number>) => {
        let best: string | null = null;
        let bestCount = 0;
        for (const [departmentId, count] of departments) {
            if (departmentId && count > bestCount) [best, bestCount] = [departmentId, count];
        }
        return best;
    };

    const byKey = new Map(existing.map((a) => [keyOf(a.name), a]));
    const toCreate: { organizationId: string; name: string; departmentId: string | null }[] = [];
    const updates: { id: string; data: { departmentId?: string | null; isActive?: boolean } }[] = [];

    for (const [key, section] of sections) {
        const departmentId = majorityDepartment(section.departments);
        const area = byKey.get(key);
        if (!area) {
            toCreate.push({ organizationId, name: section.name, departmentId });
            continue;
        }
        const data: { departmentId?: string | null; isActive?: boolean } = {};
        if (area.departmentId !== departmentId) data.departmentId = departmentId;
        if (!area.isActive) data.isActive = true;
        if (Object.keys(data).length) updates.push({ id: area.id, data });
    }
    for (const area of existing) {
        if (area.isActive && !sections.has(keyOf(area.name))) updates.push({ id: area.id, data: { isActive: false } });
    }
    if (toCreate.length === 0 && updates.length === 0) return;

    await prisma.$transaction(async (tx) => {
        // skipDuplicates: two requests syncing at once must not fail on the unique name.
        if (toCreate.length) await tx.fiveSArea.createMany({ data: toCreate, skipDuplicates: true });
        for (const u of updates) await tx.fiveSArea.update({ where: { id: u.id }, data: u.data });
        const summary = [
            toCreate.length ? `added ${toCreate.map((a) => `"${a.name}"`).join(', ')}` : null,
            updates.length ? `updated ${updates.length} area${updates.length === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join('; ');
        await tx.fiveSChangeLog.create({
            data: { organizationId, actorId: null, entityType: 'AREA', entityId: organizationId, action: 'SYNCED', summary: `Areas synced from employee profiles: ${summary}` },
        });
    });
}

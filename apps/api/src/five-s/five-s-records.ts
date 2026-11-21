import { Prisma } from 'db';
import { fromDbDate } from 'src/work/work-date';

// Shared helpers for references, the change log and response shapes.

type Tx = Prisma.TransactionClient;

export const REFERENCE_PREFIX = {
    AUDIT: '5S-AUD',
    ACTION: '5S-ACT',
    RED_TAG: '5S-RT',
} as const;

export type ReferenceKind = keyof typeof REFERENCE_PREFIX;

// INSERT .. ON CONFLICT DO UPDATE is atomic, so concurrent requests never share a number.
export async function nextReference(tx: Tx, organizationId: string, kind: ReferenceKind): Promise<string> {
    const counter = await tx.fiveSCounter.upsert({
        where: { organizationId_kind: { organizationId, kind } },
        create: { organizationId, kind, value: 1 },
        update: { value: { increment: 1 } },
        select: { value: true },
    });
    return `${REFERENCE_PREFIX[kind]}-${String(counter.value).padStart(4, '0')}`;
}

export function logChange(
    tx: Tx,
    entry: { organizationId: string; actorId: string | null; entityType: string; entityId: string; action: string; summary: string },
) {
    return tx.fiveSChangeLog.create({ data: entry });
}

export const PERSON_SELECT = { id: true, firstName: true, lastName: true } as const;

export type Person = { id: string; name: string };

export function person(employee: { id: string; firstName: string; lastName: string } | null | undefined): Person | null {
    if (!employee) return null;
    return { id: employee.id, name: `${employee.firstName} ${employee.lastName}`.trim() };
}

export function dateOnly(date: Date | null | undefined): string | null {
    return date ? fromDbDate(date) : null;
}

export function level(tenths: number | null | undefined): number | null {
    return tenths == null ? null : tenths / 10;
}

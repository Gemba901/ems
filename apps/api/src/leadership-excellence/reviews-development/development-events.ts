import { Prisma } from 'db';

export type DevelopmentEntity = 'REVIEW' | 'COACHING' | 'EFFECTIVENESS';

/** Append one audit line ("Review created", "Reflection submitted", ...). */
export function logEvent(
  tx: Prisma.TransactionClient,
  e: {
    organizationId: string;
    entity: DevelopmentEntity;
    entityId: string;
    action: string;
    actorId: string | null;
    note?: string | null;
    before?: unknown;
    after?: unknown;
  },
) {
  const json = (v: unknown) =>
    v === undefined || v === null
      ? Prisma.JsonNull
      : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);
  return tx.lexDevelopmentEvent.create({
    data: {
      organizationId: e.organizationId,
      entity: e.entity,
      entityId: e.entityId,
      action: e.action,
      actorId: e.actorId,
      note: e.note ?? null,
      before: json(e.before),
      after: json(e.after),
    },
  });
}

/** Unique-constraint violation (duplicate code or period). */
export const isUniqueViolation = (error: unknown) =>
  (error as { code?: string })?.code === 'P2002';

export const pad = (n: number) => String(n).padStart(4, '0');

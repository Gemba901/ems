import { Prisma } from 'db';
import { PrismaService } from './prisma.service';

// Never use a session-wide setting: pooled connections must not retain tenant state.
export async function tenantTransaction<T>(
  db: PrismaService,
  organizationId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!organizationId) throw new Error('Tenant context is required');
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('gemba.organization_id', ${organizationId}, true)`;
    return work(tx);
  });
}

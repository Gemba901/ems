import { Prisma } from 'db';
import { Role } from 'src/common/enum/role.enum';

export type RegistrationOutcome = 'registered' | 'failed' | 'awaitingAdmin' | 'skipped';
export interface RegistrationRunHooks {
  recordIds: string[];
  /** Called after the org lock, inside every write transaction. Must fence old workers. */
  authorize(tx: Prisma.TransactionClient): Promise<Role>;
  checkpoint(tx: Prisma.TransactionClient, recordId: string, outcome: RegistrationOutcome): Promise<void>;
}
export class RegistrationLeaseLost extends Error {}
export type RegistrationRun = {
  id: string; batchId: string; organizationId: string; actorId: string; communicationChannel: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  recordIds: string[]; completedIds: string[];
  registered: number; failed: number; awaitingAdmin: number; skipped: number;
  leaseId: string | null; leaseUntil: Date | null; recoveries: number;
  message: string | null; createdAt: Date; updatedAt: Date;
};
export type RegistrationBatchTotals = { total: number; registered: number; excluded: number };
export function publicRegistrationRun(run: RegistrationRun | null, batchTotals?: RegistrationBatchTotals) {
  if (!run) return null;
  return { id: run.id, status: run.status, total: run.recordIds.length,
    processed: run.completedIds.length, registered: run.registered, failed: run.failed,
    awaitingAdmin: run.awaitingAdmin, skipped: run.skipped, recoveries: run.recoveries,
    message: run.message, startedAt: run.createdAt, updatedAt: run.updatedAt, ...(batchTotals ? { batchTotals } : {}) };
}
/** Log only classification codes: exception messages may contain SQL or personal data. */
export function registrationErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^(P\d{4}|[0-9A-Z]{5}|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(code)
    ? code : error instanceof Error ? error.constructor.name.replace(/[^a-zA-Z]/g, '').slice(0, 60) : 'UnknownError';
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { EmsService } from './ems.service';
import { canRegisterOnboarding } from './onboarding-access';
import { retryOnboardingTransaction } from './onboarding-transaction';
import { publicRegistrationRun, RegistrationLeaseLost, RegistrationOutcome, RegistrationRun, RegistrationBatchTotals, registrationErrorCode } from './ems-registration.types';

/** One durable run per import. Employee writes and progress commit together.
 * The DB lease coordinates API instances; the local busy flag only limits load.
 * No email is sent by this worker. All SQL values are bound parameters.
 */
@Injectable()
export class EmsRegistrationService implements OnModuleDestroy {
  private busy = false;
  private stopping = false;
  private readonly logger = new Logger('EMSRegistration');
  constructor(private readonly db: PrismaService, private readonly ems: EmsService) {}
  onModuleDestroy() { this.stopping = true; }

  private async actorRole(tx: Prisma.TransactionClient, organizationId: string, actorId: string): Promise<Role> {
    const membership = await tx.userOrganization.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId } },
      select: { role: { select: { name: true } }, organization: { select: { status: true, modules: true, isAdminOrg: true } } },
    });
    if (!membership || !canRegisterOnboarding(membership.role.name) || membership.organization.status !== 'ACTIVE'
      || (!membership.organization.isAdminOrg && !membership.organization.modules.includes('EMS'))) {
      throw new ForbiddenException('Registration permission changed. An authorised HR user or Admin must start a new run.');
    }
    return membership.role.name as Role;
  }

  async start(organizationId: string, batchId: string, actorId: string) {
    const result = await retryOnboardingTransaction(() => this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR NO KEY UPDATE`;
      const role = await this.actorRole(tx, organizationId, actorId);
      const batch = await tx.emsOnboardingBatch.findFirst({ where: { id: batchId, organizationId },
        include: { records: true } });
      if (!batch) throw new NotFoundException('Onboarding batch not found');
      if (batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');
      const existing = await tx.$queryRaw<RegistrationRun[]>`SELECT * FROM "EmsRegistrationRun" WHERE "batchId" = ${batchId} AND "organizationId" = ${organizationId}`;
      const batchTotals: RegistrationBatchTotals = { total: batch.records.length,
        registered: batch.records.filter(record => record.status === 'REGISTERED').length,
        excluded: batch.records.filter(record => record.status === 'EXCLUDED').length };
      if (existing[0] && ['QUEUED', 'RUNNING'].includes(existing[0].status)) return publicRegistrationRun(existing[0], batchTotals);
      const organization = await tx.organization.findUnique({ where: {id: organizationId}, select: {communicationChannel: true} });
      if (!organization?.communicationChannel) throw new BadRequestException('Choose the company communication channel before registering.');
      const ids = await this.ems.registrationReadyIds(tx, organizationId, batch.records, batch.defaultPhoneCountry, role);
      if (!ids.length) throw new BadRequestException('No eligible records are ready to register. Validate or review the import first.');
      const rows = await tx.$queryRaw<RegistrationRun[]>`
        INSERT INTO "EmsRegistrationRun" (id, "batchId", "organizationId", "actorId", "communicationChannel", "recordIds")
        VALUES (${randomUUID()}, ${batchId}, ${organizationId}, ${actorId}, ${organization.communicationChannel}::text, ${ids}::text[])
        ON CONFLICT ("batchId") DO UPDATE SET id = EXCLUDED.id, "actorId" = EXCLUDED."actorId",
          "communicationChannel" = EXCLUDED."communicationChannel", "recordIds" = EXCLUDED."recordIds", "completedIds" = '{}', status = 'QUEUED',
          registered = 0, failed = 0, "awaitingAdmin" = 0, skipped = 0, "leaseId" = NULL,
          "leaseUntil" = NULL, recoveries = 0, message = NULL, "createdAt" = NOW(), "updatedAt" = NOW()
        RETURNING *`;
      return publicRegistrationRun(rows[0], batchTotals);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
    return result;
  }

  async status(organizationId: string, batchId: string) {
    if (!await this.db.emsOnboardingBatch.findFirst({ where: { id: batchId, organizationId }, select: { id: true } }))
      throw new NotFoundException('Onboarding batch not found');
    // One statement reads the run and whole-import totals from the same committed snapshot.
    // Count stored statuses only; polling does not reload people or resolve hierarchy.
    const rows = await this.db.$queryRaw<(RegistrationRun & { batchTotals: RegistrationBatchTotals })[]>`
      SELECT r.*, (
        SELECT json_build_object('total', count(*)::int,
          'registered', (count(*) FILTER (WHERE status = 'REGISTERED'))::int,
          'excluded', (count(*) FILTER (WHERE status = 'EXCLUDED'))::int)
        FROM "EmsOnboardingRecord" record
        WHERE record."batchId" = r."batchId" AND record."organizationId" = r."organizationId"
      ) AS "batchTotals"
      FROM "EmsRegistrationRun" r WHERE r."batchId" = ${batchId} AND r."organizationId" = ${organizationId}`;
    return publicRegistrationRun(rows[0] ?? null, rows[0]?.batchTotals);
  }

  async stop(organizationId: string, batchId: string, actorId: string) {
    await this.db.$transaction(async tx => {
      // Wait for a current employee transaction to commit, then fence all later writes.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR NO KEY UPDATE`;
      await this.actorRole(tx, organizationId, actorId);
      await tx.$executeRaw`UPDATE "EmsRegistrationRun" SET status = 'STOPPED',
        message = 'Registration paused. Completed employees are kept. Resume registers the remaining eligible ready records.',
        "leaseId" = NULL, "leaseUntil" = NULL, "updatedAt" = NOW()
        WHERE "batchId" = ${batchId} AND "organizationId" = ${organizationId} AND status IN ('QUEUED', 'RUNNING')`;
    }, { timeout: 25000 });
    return this.status(organizationId, batchId);
  }

  async claim() {
    // Claim is a single atomic statement, committed before any company lock is taken.
    const rows = await this.db.$queryRaw<RegistrationRun[]>`
      UPDATE "EmsRegistrationRun" AS r SET status = 'RUNNING', "leaseId" = ${randomUUID()},
        "leaseUntil" = NOW() + INTERVAL '90 seconds', "updatedAt" = NOW(),
        recoveries = recoveries + CASE WHEN r.status = 'RUNNING' THEN 1 ELSE 0 END
      WHERE r.id = (SELECT id FROM "EmsRegistrationRun"
        WHERE status = 'QUEUED' OR (status = 'RUNNING' AND "leaseUntil" < NOW())
        ORDER BY "updatedAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING r.*`;
    return rows[0] ?? null;
  }

  private async authorize(tx: Prisma.TransactionClient, run: RegistrationRun) {
    if (this.stopping) throw new RegistrationLeaseLost();
    const owned = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "EmsRegistrationRun"
      WHERE id = ${run.id} AND "organizationId" = ${run.organizationId} AND status = 'RUNNING'
      AND "leaseId" = ${run.leaseId} AND "leaseUntil" > clock_timestamp() FOR UPDATE`;
    if (!owned.length) throw new RegistrationLeaseLost();
    const batch = await tx.emsOnboardingBatch.findFirst({ where: { id: run.batchId, organizationId: run.organizationId }, select: { status: true } });
    if (!batch || batch.status === 'CANCELLED') throw new ConflictException('The import was cancelled or removed.');
    const organization = await tx.organization.findUnique({where:{id:run.organizationId},select:{communicationChannel:true}});
    if (organization?.communicationChannel !== run.communicationChannel) throw new ConflictException('The communication channel changed. Validate the import again before starting a new registration run.');
    return this.actorRole(tx, run.organizationId, run.actorId);
  }

  private async checkpoint(tx: Prisma.TransactionClient, run: RegistrationRun, recordId: string, outcome: RegistrationOutcome) {
    const changed = await tx.$executeRaw`UPDATE "EmsRegistrationRun"
      SET "completedIds" = array_append("completedIds", ${recordId}),
        registered = registered + ${outcome === 'registered' ? 1 : 0},
        failed = failed + ${outcome === 'failed' ? 1 : 0},
        "awaitingAdmin" = "awaitingAdmin" + ${outcome === 'awaitingAdmin' ? 1 : 0},
        skipped = skipped + ${outcome === 'skipped' ? 1 : 0},
        "leaseUntil" = clock_timestamp() + INTERVAL '90 seconds', "updatedAt" = clock_timestamp()
      WHERE id = ${run.id} AND "leaseId" = ${run.leaseId} AND status = 'RUNNING'
        AND NOT (${recordId} = ANY("completedIds"))`;
    if (changed !== 1) throw new RegistrationLeaseLost();
  }

  private async finish(run: RegistrationRun, status: 'FAILED' | 'COMPLETED', message: string) {
    const rows = await this.db.$queryRaw<RegistrationRun[]>`UPDATE "EmsRegistrationRun"
      SET status = CASE WHEN ${status} = 'COMPLETED' AND cardinality("completedIds") <> cardinality("recordIds") THEN 'FAILED' ELSE ${status} END,
        message = CASE WHEN ${status} = 'COMPLETED' AND cardinality("completedIds") <> cardinality("recordIds")
          THEN 'Some selected records changed or were removed. Refresh and review the import before retrying.' ELSE ${message} END,
        "leaseId" = NULL, "leaseUntil" = NULL, "updatedAt" = NOW()
      WHERE id = ${run.id} AND "leaseId" = ${run.leaseId} AND status = 'RUNNING' AND "leaseUntil" > NOW() RETURNING *`;
    if (rows[0]) this.logger.log({ event: 'registration_run_finished', runId: run.id, batchId: run.batchId,
      status: rows[0].status, registered: rows[0].registered, failed: rows[0].failed,
      processed: rows[0].completedIds.length, total: rows[0].recordIds.length,
      elapsedMs: Date.now() - new Date(rows[0].createdAt).getTime() });
  }

  @Interval(2000)
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    let run: RegistrationRun | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let heartbeatBusy = false;
    try {
      run = await this.claim();
      if (!run) return;
      const owned = run;
      if (run.recoveries > 3) {
        await this.finish(run, 'FAILED', 'Registration restarted repeatedly. Completed employees are kept; ask an administrator to check the API before retrying.');
        return;
      }
      heartbeat = setInterval(() => {
        if (heartbeatBusy || this.stopping) return;
        heartbeatBusy = true;
        void this.db.$executeRaw`UPDATE "EmsRegistrationRun" SET "leaseUntil" = NOW() + INTERVAL '90 seconds'
          WHERE id = ${owned.id} AND "leaseId" = ${owned.leaseId} AND status = 'RUNNING' AND "leaseUntil" > NOW() AND "updatedAt" > NOW() - INTERVAL '5 minutes'`
          .catch(() => this.logger.warn({ event: 'registration_heartbeat_failed', runId: owned.id }))
          .finally(() => { heartbeatBusy = false; });
      }, 15000);
      heartbeat.unref();
      const role = await this.actorRole(this.db, run.organizationId, run.actorId);
      this.logger.log({ event: 'registration_run_started', runId: run.id, batchId: run.batchId, total: run.recordIds.length, recovery: run.recoveries });
      // Short groups yield to other companies/imports between claims. No group-wide org lock.
      const selected = run.recordIds.filter(id => !run!.completedIds.includes(id)).slice(0, 20);
      await this.ems.registerOnboardingRecords(run.organizationId, run.batchId, role, {
        recordIds: selected,
        authorize: tx => this.authorize(tx, owned),
        checkpoint: (tx, id, outcome) => this.checkpoint(tx, owned, id, outcome),
      });
      const current = await this.db.$queryRaw<RegistrationRun[]>`SELECT * FROM "EmsRegistrationRun"
        WHERE id = ${run.id} AND "leaseId" = ${run.leaseId} AND status = 'RUNNING' AND "leaseUntil" > NOW()`;
      if (!current[0]) throw new RegistrationLeaseLost();
      if (selected.some(id => !current[0].completedIds.includes(id))) {
        await this.finish(run, 'FAILED', 'Some selected records changed or were removed. Refresh and review the import before retrying.');
      } else if (current[0].completedIds.length === current[0].recordIds.length) {
        await this.finish(run, 'COMPLETED', 'Registration finished. Review any records needing attention; invitations are a separate action.');
      } else {
        await this.db.$executeRaw`UPDATE "EmsRegistrationRun" SET status = 'QUEUED', "leaseId" = NULL,
          "leaseUntil" = NULL, "updatedAt" = NOW()
          WHERE id = ${run.id} AND "leaseId" = ${run.leaseId} AND status = 'RUNNING' AND "leaseUntil" > NOW()`;
      }
    } catch (error) {
      if (error instanceof RegistrationLeaseLost) return;
      this.logger.error({ event: 'registration_run_failed', runId: run?.id, batchId: run?.batchId, code: registrationErrorCode(error) });
      if (run) {
        // Explicit user/permission errors are safe; do not return raw DB/SDK errors.
        const message = error instanceof ForbiddenException || error instanceof ConflictException || error instanceof BadRequestException
          ? error.message : 'A technical problem interrupted registration. Completed employees are kept. Retry after checking the API; give your administrator the run reference.';
        try { await this.finish(run, 'FAILED', message); }
        catch { this.logger.warn({ event: 'registration_status_write_failed', runId: run.id }); }
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.busy = false;
    }
  }
}

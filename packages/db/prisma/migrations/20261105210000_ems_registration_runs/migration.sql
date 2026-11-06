CREATE TABLE "EmsRegistrationRun" (
 "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL UNIQUE,
 "organizationId" TEXT NOT NULL, "actorId" TEXT NOT NULL, "communicationChannel" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "recordIds" TEXT[] NOT NULL,
 "completedIds" TEXT[] NOT NULL DEFAULT '{}', "registered" INTEGER NOT NULL DEFAULT 0,
 "failed" INTEGER NOT NULL DEFAULT 0, "awaitingAdmin" INTEGER NOT NULL DEFAULT 0,
 "skipped" INTEGER NOT NULL DEFAULT 0, "leaseId" TEXT, "leaseUntil" TIMESTAMP(3),
 "recoveries" INTEGER NOT NULL DEFAULT 0, "message" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmsRegistrationRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EmsOnboardingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "EmsRegistrationRun_status_check" CHECK ("status" IN ('QUEUED','RUNNING','COMPLETED','FAILED','STOPPED'))
);
CREATE INDEX "EmsRegistrationRun_status_leaseUntil_idx" ON "EmsRegistrationRun"("status", "leaseUntil");
CREATE INDEX "EmsRegistrationRun_organizationId_idx" ON "EmsRegistrationRun"("organizationId");

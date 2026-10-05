ALTER TABLE "ActivityIngestion"
  ALTER COLUMN "status" SET DEFAULT 'QUEUED',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requestedByUserId" TEXT,
  ADD COLUMN "requestedRoleLevel" TEXT,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leaseId" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "failureMessage" TEXT;

ALTER TABLE "ActivityIngestionRow"
  ALTER COLUMN "status" SET DEFAULT 'QUEUED',
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "targetActivityId" TEXT,
  ADD COLUMN "parentActivityCode" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "ActivityIngestionRow_targetActivityId_key"
  ON "ActivityIngestionRow"("targetActivityId");
CREATE INDEX "ActivityIngestion_status_availableAt_idx"
  ON "ActivityIngestion"("status", "availableAt");
CREATE INDEX "ActivityIngestion_status_leaseUntil_idx"
  ON "ActivityIngestion"("status", "leaseUntil");

UPDATE "ActivityIngestion"
SET status = 'FAILED',
    "failedAt" = CURRENT_TIMESTAMP,
    "failureMessage" = 'This import was interrupted before durable background processing was enabled.'
WHERE status = 'PROCESSING'
  AND NOT EXISTS (
    SELECT 1
    FROM "ActivityIngestionRow" row
    WHERE row."ingestionId" = "ActivityIngestion".id
      AND row.payload IS NOT NULL
  );

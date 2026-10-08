UPDATE "ActivityIngestion"
SET status = 'QUEUED',
    "availableAt" = CURRENT_TIMESTAMP
WHERE status = 'PROCESSING'
  AND "completedAt" IS NULL
  AND "failedAt" IS NULL;

DROP INDEX IF EXISTS "ActivityIngestion_status_leaseUntil_idx";

ALTER TABLE "ActivityIngestion"
  DROP COLUMN "leaseId",
  DROP COLUMN "leaseUntil";

CREATE INDEX "ActivityIngestion_status_updatedAt_idx"
  ON "ActivityIngestion"("status", "updatedAt");

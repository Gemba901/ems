-- Reconcile migration history with production's actual live schema.
--
-- Production schema was hand-altered outside of migrations on at least two
-- occasions: the committee-review feature (added by
-- 20260506_committee_review_pipeline) was later reverted back to HOD-based
-- review directly on the database, and Employee.notificationPreferences was
-- added directly without ever generating a migration. schema.prisma reflects
-- production's current (correct) shape; this migration brings a fresh
-- database (e.g. staging) in line with it.

-- Employee.notificationPreferences: present on prod, never had a migration.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;

-- Suggestion: committee-review feature was reverted; drop committeeId.
ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_committeeId_fkey";
ALTER TABLE "Suggestion" DROP COLUMN IF EXISTS "committeeId";

-- Suggestion: restore HOD-based review columns (present on prod, never had
-- a migration of their own).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImplementationStatus') THEN
    CREATE TYPE "ImplementationStatus" AS ENUM (
      'WORK_IN_PROGRESS',
      'VERY_SLOW_WORK_IN_PROGRESS',
      'GOOD_WORK_IN_PROGRESS',
      'SLOW_PROGRESS',
      'IMPLEMENTED',
      'SHIFTED_TO_SGA',
      'PREVIOUSLY_IMPLEMENTED',
      'UNDER_CONSULTATION',
      'IMPRACTICAL',
      'SAVED_FOR_LATER'
    );
  END IF;
END $$;

ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "implementationStatus" "ImplementationStatus";
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "implementationNote" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "hodId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Suggestion_hodId_fkey' AND cl.relname = 'Suggestion'
  ) THEN
    ALTER TABLE "Suggestion"
      ADD CONSTRAINT "Suggestion_hodId_fkey"
      FOREIGN KEY ("hodId") REFERENCES "Employee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- SIMS 8-status pipeline + HOD-to-committee forwarding
-- (docs/sims-review-pipeline-timeline.md, docs/sims-hod-committee-roadmap.md)
--
-- Depends on 20260719080000_sims_status_enum_additions having already run
-- (WAITING_FOR_REVIEW / IMPLEMENTED must exist on SuggestionStatus before this
-- migration sets WAITING_FOR_REVIEW as the column default).
--
-- Additive only: no existing column is dropped, renamed, or has its type
-- changed, and no backfill runs. Existing rows keep decisionType: null,
-- committeeId: null until next touched. Kept narrow deliberately — see
-- docs/deployment.md "Known drift" for why a prior committeeId + full
-- status-enum replacement was reverted by hand on production.

-- 1. DecisionType enum (set alongside status: APPROVED_FOR_IMPLEMENTATION)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DecisionType') THEN
    CREATE TYPE "DecisionType" AS ENUM ('WORKPLACE_CORRECTION', 'DAILY_KAIZEN');
  END IF;
END $$;

-- 2. New Suggestion columns
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "decisionType" "DecisionType";
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "decisionDetails" JSONB;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "committeeId" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "forwardedToCommitteeAt" TIMESTAMP(3);

-- New suggestions start at WAITING_FOR_REVIEW instead of UNDER_REVIEW
ALTER TABLE "Suggestion" ALTER COLUMN "status" SET DEFAULT 'WAITING_FOR_REVIEW';

-- 3. Suggestion.committeeId -> SteeringCommittee (SetNull, mirrors schema.prisma)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Suggestion_committeeId_fkey' AND cl.relname = 'Suggestion'
  ) THEN
    ALTER TABLE "Suggestion"
      ADD CONSTRAINT "Suggestion_committeeId_fkey"
      FOREIGN KEY ("committeeId") REFERENCES "SteeringCommittee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Organization's single designated SGA committee
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "sgaCommitteeId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Organization_sgaCommitteeId_fkey' AND cl.relname = 'Organization'
  ) THEN
    ALTER TABLE "Organization"
      ADD CONSTRAINT "Organization_sgaCommitteeId_fkey"
      FOREIGN KEY ("sgaCommitteeId") REFERENCES "SteeringCommittee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

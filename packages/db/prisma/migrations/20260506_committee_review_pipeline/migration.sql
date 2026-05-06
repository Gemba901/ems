-- Step 1: Migrate SUBMITTED suggestions to UNDER_REVIEW
UPDATE "Suggestion" SET status = 'UNDER_REVIEW' WHERE status = 'SUBMITTED';

-- Step 2: Recreate SuggestionStatus enum without SUBMITTED
CREATE TYPE "SuggestionStatus_new" AS ENUM (
  'UNDER_REVIEW',
  'NEEDS_CLARIFICATION',
  'APPROVED',
  'REJECTED',
  'IMPLEMENTED',
  'ARCHIVED'
);

-- Step 3: Swap column type
ALTER TABLE "Suggestion"
  ALTER COLUMN status TYPE "SuggestionStatus_new"
  USING status::text::"SuggestionStatus_new";

-- Step 4: Swap default
ALTER TABLE "Suggestion"
  ALTER COLUMN status SET DEFAULT 'UNDER_REVIEW'::"SuggestionStatus_new";

-- Step 5: Replace the enum
DROP TYPE "SuggestionStatus";
ALTER TYPE "SuggestionStatus_new" RENAME TO "SuggestionStatus";

-- Step 6: Add committeeId to Suggestion
ALTER TABLE "Suggestion" ADD COLUMN "committeeId" TEXT;

ALTER TABLE "Suggestion"
  ADD CONSTRAINT "Suggestion_committeeId_fkey"
  FOREIGN KEY ("committeeId")
  REFERENCES "SteeringCommittee"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

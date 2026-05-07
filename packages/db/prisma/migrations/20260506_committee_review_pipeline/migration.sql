-- Step 1: Migrate SUBMITTED rows (no-op if SUBMITTED was already removed from the enum)
UPDATE "Suggestion" SET status = 'UNDER_REVIEW' WHERE status::text = 'SUBMITTED';

-- Step 2: Create the replacement enum (skip if it already exists from a previous partial run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus_new') THEN
    CREATE TYPE "SuggestionStatus_new" AS ENUM (
      'UNDER_REVIEW',
      'NEEDS_CLARIFICATION',
      'APPROVED',
      'REJECTED',
      'IMPLEMENTED',
      'ARCHIVED'
    );
  END IF;
END $$;

-- Step 3: Drop the column default so PostgreSQL can change the type
ALTER TABLE "Suggestion" ALTER COLUMN status DROP DEFAULT;

-- Step 4: Swap Suggestion.status (skip if already on the new type)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_type  t ON a.atttypid  = t.oid
    WHERE c.relname = 'Suggestion' AND a.attname = 'status' AND t.typname = 'SuggestionStatus'
  ) THEN
    ALTER TABLE "Suggestion"
      ALTER COLUMN status TYPE "SuggestionStatus_new"
      USING status::text::"SuggestionStatus_new";
  END IF;
END $$;

-- Step 5: Swap SuggestionReview.statusChanged (skip if already on the new type)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_type  t ON a.atttypid  = t.oid
    WHERE c.relname = 'SuggestionReview' AND a.attname = 'statusChanged' AND t.typname = 'SuggestionStatus'
  ) THEN
    ALTER TABLE "SuggestionReview"
      ALTER COLUMN "statusChanged" TYPE "SuggestionStatus_new"
      USING "statusChanged"::text::"SuggestionStatus_new";
  END IF;
END $$;

-- Step 6: Drop the old enum (nothing depends on it any more)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus') THEN
    DROP TYPE "SuggestionStatus";
  END IF;
END $$;

-- Step 7: Rename the new enum to the canonical name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus_new') THEN
    ALTER TYPE "SuggestionStatus_new" RENAME TO "SuggestionStatus";
  END IF;
END $$;

-- Step 8: Restore the column default using the final type name
ALTER TABLE "Suggestion"
  ALTER COLUMN status SET DEFAULT 'UNDER_REVIEW'::"SuggestionStatus";

-- Step 9: Add committeeId column
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "committeeId" TEXT;

-- Step 10: Add foreign key (skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Suggestion_committeeId_fkey' AND cl.relname = 'Suggestion'
  ) THEN
    ALTER TABLE "Suggestion"
      ADD CONSTRAINT "Suggestion_committeeId_fkey"
      FOREIGN KEY ("committeeId")
      REFERENCES "SteeringCommittee"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

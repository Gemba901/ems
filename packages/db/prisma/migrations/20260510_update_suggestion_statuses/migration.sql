-- Update SuggestionStatus enum: replace old statuses with new ones
-- Old: UNDER_REVIEW, NEEDS_CLARIFICATION, APPROVED, REJECTED, IMPLEMENTED, ARCHIVED
-- New: UNDER_REVIEW, APPROVED_FOR_IMPLEMENTATION, REJECTED, ON_HOLD, SELECTED_FOR_SGA

-- Step 1: Create the new enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus_new') THEN
    CREATE TYPE "SuggestionStatus_new" AS ENUM (
      'UNDER_REVIEW',
      'APPROVED_FOR_IMPLEMENTATION',
      'REJECTED',
      'ON_HOLD',
      'SELECTED_FOR_SGA'
    );
  END IF;
END $$;

-- Step 2: Drop the column default so PostgreSQL can change the type
ALTER TABLE "Suggestion" ALTER COLUMN status DROP DEFAULT;

-- Step 3: Swap Suggestion.status using a CASE to remap old values
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
      USING (
        CASE status::text
          WHEN 'UNDER_REVIEW'       THEN 'UNDER_REVIEW'
          WHEN 'NEEDS_CLARIFICATION' THEN 'ON_HOLD'
          WHEN 'APPROVED'           THEN 'APPROVED_FOR_IMPLEMENTATION'
          WHEN 'REJECTED'           THEN 'REJECTED'
          WHEN 'IMPLEMENTED'        THEN 'APPROVED_FOR_IMPLEMENTATION'
          WHEN 'ARCHIVED'           THEN 'REJECTED'
          ELSE 'UNDER_REVIEW'
        END
      )::"SuggestionStatus_new";
  END IF;
END $$;

-- Step 4: Swap SuggestionReview.statusChanged using a CASE to remap old values
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
      USING (
        CASE "statusChanged"::text
          WHEN 'UNDER_REVIEW'        THEN 'UNDER_REVIEW'
          WHEN 'NEEDS_CLARIFICATION' THEN 'ON_HOLD'
          WHEN 'APPROVED'            THEN 'APPROVED_FOR_IMPLEMENTATION'
          WHEN 'REJECTED'            THEN 'REJECTED'
          WHEN 'IMPLEMENTED'         THEN 'APPROVED_FOR_IMPLEMENTATION'
          WHEN 'ARCHIVED'            THEN 'REJECTED'
          ELSE 'UNDER_REVIEW'
        END
      )::"SuggestionStatus_new";
  END IF;
END $$;

-- Step 5: Drop the old enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus') THEN
    DROP TYPE "SuggestionStatus";
  END IF;
END $$;

-- Step 6: Rename the new enum to canonical name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus_new') THEN
    ALTER TYPE "SuggestionStatus_new" RENAME TO "SuggestionStatus";
  END IF;
END $$;

-- Step 7: Restore the column default
ALTER TABLE "Suggestion"
  ALTER COLUMN status SET DEFAULT 'UNDER_REVIEW'::"SuggestionStatus";

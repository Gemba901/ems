-- Step 1: Add new categories array column (populate from existing category)
ALTER TABLE "Suggestion" ADD COLUMN "categories" "SuggestionCategory"[] NOT NULL DEFAULT '{}';

UPDATE "Suggestion" SET "categories" = ARRAY["category"]::"SuggestionCategory"[];

-- Step 2: Drop the old single-value column and priority
ALTER TABLE "Suggestion" DROP COLUMN "category";
ALTER TABLE "Suggestion" DROP COLUMN "priority";

-- Step 3: Drop the SuggestionPriority enum (no longer used)
DROP TYPE IF EXISTS "SuggestionPriority";

-- This migration is non-transactional (ALTER TYPE ADD VALUE cannot run inside a transaction)

-- Step 1: Add UNKNOWN to SuggestionCategory enum
ALTER TYPE "SuggestionCategory" ADD VALUE IF NOT EXISTS 'UNKNOWN';

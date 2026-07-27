-- SIMS 8-status pipeline (docs/sims-review-pipeline-timeline.md)
--
-- Adds the two new terminal/entry SuggestionStatus values. Kept as its own
-- migration, isolated from any statement that references the new values
-- (e.g. a column DEFAULT), because Postgres won't let a new enum value be
-- used in the same transaction that added it. Same pattern already used in
-- 20260502_session2_suggestion_overhaul.

ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_REVIEW';
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'IMPLEMENTED';

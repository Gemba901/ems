-- Add YEARLY to EventRecurrencePattern so calendar events can repeat annually.
-- Must be its own migration: Postgres does not allow a new enum value to be
-- used in the same transaction that adds it.
ALTER TYPE "EventRecurrencePattern" ADD VALUE IF NOT EXISTS 'YEARLY';

-- Add DWMS to ModuleType so it can be enabled per-organization.
-- Must be its own migration: Postgres does not allow a new enum value to be
-- used in the same transaction that adds it.
ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'DWMS';

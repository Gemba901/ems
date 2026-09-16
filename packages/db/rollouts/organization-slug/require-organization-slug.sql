-- Staged migration: promote to prisma/migrations/<new_timestamp>_require_organization_slug/migration.sql
-- ONLY AFTER the nullable migration, creation code and reviewed backfill are deployed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Organization" WHERE "slug" IS NULL) THEN
        RAISE EXCEPTION 'Backfill all organization slugs before enforcing NOT NULL';
    END IF;
END $$;

ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;
COMMIT;

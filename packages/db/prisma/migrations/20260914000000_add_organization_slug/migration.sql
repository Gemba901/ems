-- Keep the column nullable until existing organizations have reviewed slugs.
-- PostgreSQL permits multiple NULL values in this unique index.
BEGIN;

ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

COMMIT;

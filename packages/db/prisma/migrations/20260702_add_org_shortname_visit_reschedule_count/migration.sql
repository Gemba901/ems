-- Add Organization.shortName and ConsultancyVisit.rescheduleCount
-- These columns were added to schema.prisma in commit 3ae1b23 ("calendar fixes")
-- but no migration was ever generated for them.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "shortName" TEXT;
ALTER TABLE "ConsultancyVisit" ADD COLUMN IF NOT EXISTS "rescheduleCount" INTEGER NOT NULL DEFAULT 0;

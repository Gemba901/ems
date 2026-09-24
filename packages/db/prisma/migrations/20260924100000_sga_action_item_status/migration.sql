-- Action items can be ticked off one by one while the SGA runs.
DO $$ BEGIN
  CREATE TYPE "SgaActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "SgaActionItem" ADD COLUMN IF NOT EXISTS "status" "SgaActionStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "SgaActionItem" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

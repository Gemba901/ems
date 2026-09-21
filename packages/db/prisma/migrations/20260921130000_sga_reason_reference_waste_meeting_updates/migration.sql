-- Split SgaStartingReason.EXTERNAL_CUSTOMER_REQUIREMENT_OR_COMPLAINT into two values.
-- Pattern mirrors 20260506_committee_review_pipeline (Postgres has no direct
-- "remove enum value", so the type is recreated).

-- Step 1: create the replacement enum (skip if it already exists from a previous partial run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SgaStartingReason_new') THEN
    CREATE TYPE "SgaStartingReason_new" AS ENUM (
      'QUALITY_PROBLEM_OR_IMPROVEMENT',
      'COST_REDUCTION_OR_FINANCIAL_LOSS',
      'DELIVERY_DELAY_OR_PROCESS_FLOW',
      'SAFETY_OR_ENVIRONMENTAL_IMPROVEMENT',
      'PRODUCTIVITY_OR_CAPACITY_IMPROVEMENT',
      'MORALE_TEAMWORK_OR_WORK_DIFFICULTY',
      'TECHNOLOGY_OR_AUTOMATION_IMPROVEMENT',
      'SYSTEMS_INFORMATION_OR_DATA_REPORTING_IMPROVEMENT',
      'INVENTORY_OR_WIP_REDUCTION',
      'MACHINE_BREAKDOWN_OR_EQUIPMENT_PERFORMANCE',
      'SMED_CHANGEOVER_TIME_REDUCTION',
      'EXTERNAL_CUSTOMER_REQUIREMENT',
      'EXTERNAL_CUSTOMER_COMPLAINT',
      'INTERNAL_CUSTOMER_OR_CROSS_FUNCTIONAL_REQUIREMENT',
      'ALERT_OR_ABNORMALITY_REQUIRING_TEAM_PROJECT',
      'AUDIT_FINDING_OR_GEMBA_WALK_OBSERVATION',
      'MANAGEMENT_IMPROVEMENT_PRIORITY',
      'DAILY_KAIZEN_UPGRADED_TO_SGA',
      'OTHER'
    );
  END IF;
END $$;

-- Step 2: swap Sga.startingReason to the new type (skip if already on the new type).
-- The value being split is remapped here, in the same USING expression, since it
-- isn't a valid member of the OLD enum type and can't be assigned via a plain
-- UPDATE beforehand (best-effort default: there is no way to recover which of the
-- two the row actually meant).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_type  t ON a.atttypid  = t.oid
    WHERE c.relname = 'Sga' AND a.attname = 'startingReason' AND t.typname = 'SgaStartingReason'
  ) THEN
    ALTER TABLE "Sga"
      ALTER COLUMN "startingReason" TYPE "SgaStartingReason_new"
      USING (
        CASE "startingReason"::text
          WHEN 'EXTERNAL_CUSTOMER_REQUIREMENT_OR_COMPLAINT' THEN 'EXTERNAL_CUSTOMER_REQUIREMENT'
          ELSE "startingReason"::text
        END
      )::"SgaStartingReason_new";
  END IF;
END $$;

-- Step 3: drop the old type and rename the new type into place (skip if already renamed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SgaStartingReason') THEN
    DROP TYPE "SgaStartingReason";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SgaStartingReason_new') THEN
    ALTER TYPE "SgaStartingReason_new" RENAME TO "SgaStartingReason";
  END IF;
END $$;

-- Reference type: classify what an "Applicable" reference actually points to
DO $$ BEGIN
  CREATE TYPE "SgaReferenceType" AS ENUM (
    'ISO_STANDARD_OR_CLAUSE',
    'SOP_OR_WORK_INSTRUCTION',
    'AUDIT_REPORT_OR_FINDING',
    'CUSTOMER_SPECIFICATION',
    'REGULATORY_OR_STATUTORY_REQUIREMENT',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Sga" ADD COLUMN IF NOT EXISTS "referenceType" "SgaReferenceType";

-- Meeting plan: custom frequency support
ALTER TYPE "SgaMeetingFrequency" ADD VALUE IF NOT EXISTS 'CUSTOM';
ALTER TABLE "Sga" ADD COLUMN IF NOT EXISTS "meetingFrequencyCustomText" TEXT;

-- Seven wastes: replace the plain tag array with a row-per-waste table carrying
-- "what is being measured", mirroring SgaQcdsmtImpact's behavior.
CREATE TABLE "SgaWasteImpact" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "waste" "SgaWaste" NOT NULL,
    "whatIsMeasured" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaWasteImpact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SgaWasteImpact_sgaId_idx" ON "SgaWasteImpact"("sgaId");

CREATE UNIQUE INDEX "SgaWasteImpact_sgaId_waste_key" ON "SgaWasteImpact"("sgaId", "waste");

ALTER TABLE "SgaWasteImpact" ADD CONSTRAINT "SgaWasteImpact_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry over any existing wastes[] tags with an empty measurement placeholder
INSERT INTO "SgaWasteImpact" ("id", "sgaId", "waste", "whatIsMeasured", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "Sga"."id", w, '', now(), now()
FROM "Sga", unnest("Sga"."wastes") AS w
WHERE array_length("Sga"."wastes", 1) > 0;

ALTER TABLE "Sga" DROP COLUMN "wastes";

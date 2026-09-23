-- Meeting plan: end time (duration is now computed client-side from start/end)
ALTER TABLE "Sga" ADD COLUMN IF NOT EXISTS "meetingEndTime" TEXT;

-- Root cause analysis: shared file evidence for the "simple" tools (Pareto,
-- Process Observation, Data Trend, Other) which share one notes+upload block
-- via the existing "otherAnalysisNotes" column when several are selected together.
ALTER TABLE "Sga" ADD COLUMN IF NOT EXISTS "otherAnalysisFileUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Root cause analysis: Why-Why is now a structured, repeatable chain instead of
-- free text folded into otherAnalysisNotes.
DO $$ BEGIN
  CREATE TYPE "SgaWhyWhyDecision" AS ENUM ('MORE_INVESTIGATION_REQUIRED', 'ROOT_CAUSE_CONFIRMED', 'NOT_ROOT_CAUSE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "SgaWhyWhyChain" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "causeToInvestigate" TEXT NOT NULL,
    "linked5mCategory" "SgaFishboneCategory",
    "whys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" TEXT,
    "finalDecision" "SgaWhyWhyDecision" NOT NULL DEFAULT 'MORE_INVESTIGATION_REQUIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaWhyWhyChain_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SgaWhyWhyChain_sgaId_idx" ON "SgaWhyWhyChain"("sgaId");

ALTER TABLE "SgaWhyWhyChain" ADD CONSTRAINT "SgaWhyWhyChain_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Benefits: replace the single free-text QCDSMT summary with one row per
-- selected category, matching the Step 1.3 Impact pattern. There is no
-- reliable per-category mapping for whatever free text existed before, so
-- the old column is dropped without migrating its contents.
CREATE TABLE "SgaQcdsmtBenefit" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "category" "SgaQcdsmtCategory" NOT NULL,
    "whatWasAchieved" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaQcdsmtBenefit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SgaQcdsmtBenefit_sgaId_idx" ON "SgaQcdsmtBenefit"("sgaId");

CREATE UNIQUE INDEX "SgaQcdsmtBenefit_sgaId_category_key" ON "SgaQcdsmtBenefit"("sgaId", "category");

ALTER TABLE "SgaQcdsmtBenefit" ADD CONSTRAINT "SgaQcdsmtBenefit_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Sga" DROP COLUMN IF EXISTS "qcdsmtBenefitAchieved";

-- Seven wastes: give SgaWasteImpact the same full field set as SgaQcdsmtImpact
-- (baseline/target/unit/currency/expected benefit), not just "what is measured".
ALTER TABLE "SgaWasteImpact"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "baselineValue" TEXT,
  ADD COLUMN IF NOT EXISTS "targetValue" TEXT,
  ADD COLUMN IF NOT EXISTS "unit" "SgaUnit" NOT NULL DEFAULT 'PIECES',
  ADD COLUMN IF NOT EXISTS "otherUnitLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT,
  ADD COLUMN IF NOT EXISTS "expectedBenefit" TEXT;

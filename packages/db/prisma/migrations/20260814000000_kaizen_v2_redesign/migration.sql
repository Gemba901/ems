-- Kaizen v2 redesign: 9-part gated flow replacing the 3-step wizard.
-- This module was reworked as recently as the previous migration and holds
-- no real production data (staging), so existing Kaizen rows are truncated
-- rather than mapped onto the new state machine (confirmed with product owner).

-- 1. Drop rows first so all subsequent column/type changes are trivial.
DELETE FROM "Kaizen";

-- 2. Drop the FK + columns being removed from Kaizen.
ALTER TABLE "Kaizen" DROP CONSTRAINT IF EXISTS "Kaizen_verifiedById_fkey";

ALTER TABLE "Kaizen"
  DROP COLUMN "afterPhotoUrl",
  DROP COLUMN "improvementDescription",
  DROP COLUMN "benefitAchieved",
  DROP COLUMN "benefitCategory",
  DROP COLUMN "beforeValue",
  DROP COLUMN "afterValue",
  DROP COLUMN "costSaving",
  DROP COLUMN "comments",
  DROP COLUMN "verifiedById",
  DROP COLUMN "verificationComment",
  DROP COLUMN "standardUpdated";

-- 3. Rename columns kept from the old flow.
ALTER TABLE "Kaizen" RENAME COLUMN "problem" TO "conditionDescription";
ALTER TABLE "Kaizen" RENAME COLUMN "beforePhotoUrls" TO "conditionEvidenceUrls";

-- 4. Recreate KaizenTrigger (AUDIT_OR_GEMBA_WALK_OBSERVATION split in two).
--    Table has no rows at this point, so the USING cast is a formality.
ALTER TYPE "KaizenTrigger" RENAME TO "KaizenTrigger_old";
CREATE TYPE "KaizenTrigger" AS ENUM (
  'PROBLEM_NOTICED',
  'IMPROVEMENT_OPPORTUNITY_NOTICED',
  'ALERT_ACTION_REQUIRED',
  'ABNORMALITY_ACTION_REQUIRED',
  'EMPLOYEE_SUGGESTION_OR_IDEA',
  'AUDIT_OBSERVATION',
  'GEMBA_WALK_OBSERVATION',
  'CUSTOMER_COMPLAINT_OR_FEEDBACK',
  'MANAGEMENT_INSTRUCTION_OR_FEEDBACK',
  'REPEAT_PROBLEM',
  'OTHER'
);
ALTER TABLE "Kaizen" ALTER COLUMN "trigger" TYPE "KaizenTrigger" USING ("trigger"::text::"KaizenTrigger");
DROP TYPE "KaizenTrigger_old";

-- 5. Recreate KaizenStatus with the new 9-value state machine.
ALTER TABLE "Kaizen" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "KaizenStatus" RENAME TO "KaizenStatus_old";
CREATE TYPE "KaizenStatus" AS ENUM (
  'DRAFT',
  'PENDING_HOD_PRE_REVIEW',
  'RETURNED_FOR_REVISION',
  'REJECTED',
  'MOVED_TO_SGA',
  'IN_IMPLEMENTATION',
  'PENDING_VERIFICATION',
  'RETURNED_FOR_REWORK',
  'VERIFIED_CLOSED'
);
ALTER TABLE "Kaizen" ALTER COLUMN "status" TYPE "KaizenStatus" USING ("status"::text::"KaizenStatus");
ALTER TABLE "Kaizen" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "KaizenReview" ALTER COLUMN "statusChanged" TYPE "KaizenStatus" USING ("statusChanged"::text::"KaizenStatus");
DROP TYPE "KaizenStatus_old";

-- 6. New enums for parts 2, 5, 6, 7, 9.
CREATE TYPE "KaizenReferenceApplicability" AS ENUM ('APPLICABLE', 'NOT_APPLICABLE', 'REFERENCE_NOT_FOUND');
CREATE TYPE "KaizenQcdsmtCategory" AS ENUM ('QUALITY', 'COST', 'DELIVERY', 'SAFETY', 'MORALE', 'TECHNOLOGY');
CREATE TYPE "KaizenUnit" AS ENUM ('SECONDS', 'HOURS', 'MINUTES', 'PIECES', 'KILOGRAMS', 'TONNES', 'METRES', 'LITRES', 'PERCENTAGE', 'CURRENCY', 'OTHER');
CREATE TYPE "KaizenWaste" AS ENUM ('TRANSPORTATION', 'INVENTORY', 'MOTION', 'WAITING', 'OVERPRODUCTION', 'OVERPROCESSING', 'DEFECTS', 'NOT_APPLICABLE');
CREATE TYPE "KaizenHodPreReviewDecision" AS ENUM ('PENDING', 'APPROVE', 'RETURN', 'REJECT', 'MOVE_TO_SGA');
CREATE TYPE "KaizenVerificationStage" AS ENUM ('HOD', 'STEERING_COMMITTEE', 'FINANCE');
CREATE TYPE "KaizenVerificationDecision" AS ENUM ('PENDING', 'VERIFIED', 'RETURN', 'NOT_APPLICABLE');

-- 7. New columns on Kaizen.
ALTER TABLE "Kaizen"
  ADD COLUMN "referenceValue" TEXT,
  ADD COLUMN "referenceApplicability" "KaizenReferenceApplicability",
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "kaizenOwnerId" TEXT,
  ADD COLUMN "wastesReduced" "KaizenWaste"[] NOT NULL DEFAULT ARRAY[]::"KaizenWaste"[],
  ADD COLUMN "hodPreReviewDecision" "KaizenHodPreReviewDecision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "hodPreReviewRemarks" TEXT,
  ADD COLUMN "hodPreReviewById" TEXT,
  ADD COLUMN "hodPreReviewAt" TIMESTAMP(3),
  ADD COLUMN "actionTaken" TEXT,
  ADD COLUMN "afterPhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "resultSaving" TEXT,
  ADD COLUMN "financialSavingAmount" DECIMAL(14, 2);

ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_kaizenOwnerId_fkey"
  FOREIGN KEY ("kaizenOwnerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_hodPreReviewById_fkey"
  FOREIGN KEY ("hodPreReviewById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Kaizen_kaizenOwnerId_idx" ON "Kaizen"("kaizenOwnerId");
CREATE INDEX "Kaizen_departmentId_status_idx" ON "Kaizen"("departmentId", "status");

-- 8. New child tables for parts 5 and 9.
CREATE TABLE "KaizenQcdsmtImpact" (
  "id" TEXT NOT NULL,
  "kaizenId" TEXT NOT NULL,
  "category" "KaizenQcdsmtCategory" NOT NULL,
  "whatIsMeasured" TEXT NOT NULL,
  "beforeValue" TEXT,
  "afterValue" TEXT,
  "unit" "KaizenUnit" NOT NULL,
  "otherUnitLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KaizenQcdsmtImpact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KaizenQcdsmtImpact_kaizenId_category_key" ON "KaizenQcdsmtImpact"("kaizenId", "category");
CREATE INDEX "KaizenQcdsmtImpact_kaizenId_idx" ON "KaizenQcdsmtImpact"("kaizenId");
ALTER TABLE "KaizenQcdsmtImpact" ADD CONSTRAINT "KaizenQcdsmtImpact_kaizenId_fkey"
  FOREIGN KEY ("kaizenId") REFERENCES "Kaizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "KaizenVerification" (
  "id" TEXT NOT NULL,
  "kaizenId" TEXT NOT NULL,
  "stage" "KaizenVerificationStage" NOT NULL,
  "decision" "KaizenVerificationDecision" NOT NULL DEFAULT 'PENDING',
  "remarks" TEXT,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KaizenVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KaizenVerification_kaizenId_stage_key" ON "KaizenVerification"("kaizenId", "stage");
CREATE INDEX "KaizenVerification_kaizenId_idx" ON "KaizenVerification"("kaizenId");
ALTER TABLE "KaizenVerification" ADD CONSTRAINT "KaizenVerification_kaizenId_fkey"
  FOREIGN KEY ("kaizenId") REFERENCES "Kaizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KaizenVerification" ADD CONSTRAINT "KaizenVerification_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

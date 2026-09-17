-- CreateEnum
CREATE TYPE "SgaStatus" AS ENUM ('DRAFT', 'PENDING_HOD_APPROVAL', 'RETURNED_FOR_REVISION', 'REJECTED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'RETURNED_FOR_REWORK', 'VERIFIED_CLOSED');

-- CreateEnum
CREATE TYPE "SgaStartingReason" AS ENUM ('QUALITY_PROBLEM_OR_IMPROVEMENT', 'COST_REDUCTION_OR_FINANCIAL_LOSS', 'DELIVERY_DELAY_OR_PROCESS_FLOW', 'SAFETY_OR_ENVIRONMENTAL_IMPROVEMENT', 'PRODUCTIVITY_OR_CAPACITY_IMPROVEMENT', 'MORALE_TEAMWORK_OR_WORK_DIFFICULTY', 'TECHNOLOGY_OR_AUTOMATION_IMPROVEMENT', 'SYSTEMS_INFORMATION_OR_DATA_REPORTING_IMPROVEMENT', 'INVENTORY_OR_WIP_REDUCTION', 'MACHINE_BREAKDOWN_OR_EQUIPMENT_PERFORMANCE', 'SMED_CHANGEOVER_TIME_REDUCTION', 'EXTERNAL_CUSTOMER_REQUIREMENT_OR_COMPLAINT', 'INTERNAL_CUSTOMER_OR_CROSS_FUNCTIONAL_REQUIREMENT', 'ALERT_OR_ABNORMALITY_REQUIRING_TEAM_PROJECT', 'AUDIT_FINDING_OR_GEMBA_WALK_OBSERVATION', 'MANAGEMENT_IMPROVEMENT_PRIORITY', 'DAILY_KAIZEN_UPGRADED_TO_SGA', 'OTHER');

-- CreateEnum
CREATE TYPE "SgaReferenceApplicability" AS ENUM ('APPLICABLE', 'NOT_APPLICABLE', 'REFERENCE_NOT_FOUND');

-- CreateEnum
CREATE TYPE "SgaQcdsmtCategory" AS ENUM ('QUALITY', 'COST', 'DELIVERY', 'SAFETY', 'MORALE', 'TECHNOLOGY');

-- CreateEnum
CREATE TYPE "SgaUnit" AS ENUM ('SECONDS', 'HOURS', 'MINUTES', 'PIECES', 'KILOGRAMS', 'TONNES', 'METRES', 'LITRES', 'PERCENTAGE', 'CURRENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "SgaWaste" AS ENUM ('TRANSPORTATION', 'INVENTORY', 'MOTION', 'WAITING', 'OVERPRODUCTION', 'OVERPROCESSING', 'DEFECTS', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SgaHodDecision" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SgaMeetingFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SgaWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "SgaRootCauseTool" AS ENUM ('FISHBONE_5M', 'WHY_WHY', 'PARETO', 'PROCESS_OBSERVATION', 'DATA_TREND', 'OTHER');

-- CreateEnum
CREATE TYPE "SgaFishboneCategory" AS ENUM ('PEOPLE', 'MACHINE', 'MATERIAL', 'METHOD', 'MEASUREMENT', 'ENVIRONMENT_OTHER');

-- CreateEnum
CREATE TYPE "SgaImplementationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "SgaVerificationStage" AS ENUM ('AFFECTED_DEPARTMENT', 'HOD', 'STEERING_COMMITTEE', 'FINANCE');

-- CreateEnum
CREATE TYPE "SgaVerificationDecision" AS ENUM ('PENDING', 'VERIFIED', 'RETURN', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SgaBenefitPeriod" AS ENUM ('PER_DAY', 'PER_WEEK', 'PER_MONTH', 'PER_YEAR', 'ONE_TIME');

-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE 'SGA';

-- CreateTable
CREATE TABLE "Sga" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "SgaStatus" NOT NULL DEFAULT 'DRAFT',
    "startingReason" "SgaStartingReason",
    "referenceApplicability" "SgaReferenceApplicability",
    "referenceNumber" TEXT,
    "title" TEXT,
    "problemDescription" TEXT,
    "startDate" TIMESTAMP(3),
    "targetCompletionDate" TIMESTAMP(3),
    "mainDepartmentId" TEXT,
    "workArea" TEXT,
    "beforeFileUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wastes" "SgaWaste"[] DEFAULT ARRAY[]::"SgaWaste"[],
    "ownerId" TEXT,
    "meetingFrequency" "SgaMeetingFrequency",
    "meetingDay" "SgaWeekday",
    "meetingTime" TEXT,
    "meetingDurationMinutes" INTEGER,
    "meetingLocation" TEXT,
    "requiredResources" TEXT,
    "expectedBenefitSummary" TEXT,
    "approximateInvestmentAmount" DECIMAL(14,2),
    "approximateInvestmentCurrency" TEXT,
    "hodDecision" "SgaHodDecision" NOT NULL DEFAULT 'PENDING',
    "hodRemarks" TEXT,
    "hodDecisionById" TEXT,
    "hodDecisionAt" TIMESTAMP(3),
    "evidenceSource" TEXT,
    "immediateControlNeeded" BOOLEAN NOT NULL DEFAULT false,
    "rootCauseTools" "SgaRootCauseTool"[] DEFAULT ARRAY[]::"SgaRootCauseTool"[],
    "otherAnalysisNotes" TEXT,
    "implementationSummary" TEXT,
    "afterFileUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actualImplementationCost" DECIMAL(14,2),
    "actualImplementationCostCurrency" TEXT,
    "implementationStatus" "SgaImplementationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "qcdsmtBenefitAchieved" TEXT,
    "wasteReductionAchieved" TEXT,
    "financialLossBeforeImprovement" DECIMAL(14,2),
    "verifiedGrossBenefit" DECIMAL(14,2),
    "benefitPeriod" "SgaBenefitPeriod",
    "effectivenessConfirmationPeriod" TEXT,
    "sopUpdated" BOOLEAN NOT NULL DEFAULT false,
    "employeesTrained" BOOLEAN NOT NULL DEFAULT false,
    "followUpCheckPlanned" BOOLEAN NOT NULL DEFAULT false,
    "appliedElsewhere" BOOLEAN NOT NULL DEFAULT false,
    "lessonsLearned" TEXT,
    "verifyingDepartmentId" TEXT,
    "departmentRepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaQcdsmtImpact" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "category" "SgaQcdsmtCategory" NOT NULL,
    "description" TEXT,
    "whatIsMeasured" TEXT NOT NULL,
    "baselineValue" TEXT,
    "targetValue" TEXT,
    "unit" "SgaUnit" NOT NULL,
    "otherUnitLabel" TEXT,
    "currency" TEXT,
    "expectedBenefit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaQcdsmtImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaMeasure" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "whatIsMeasured" TEXT NOT NULL,
    "baselineValue" TEXT,
    "targetValue" TEXT,
    "finalResultValue" TEXT,
    "unit" "SgaUnit" NOT NULL,
    "otherUnitLabel" TEXT,
    "linkedQcdsmt" "SgaQcdsmtCategory",
    "linkedWaste" "SgaWaste",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaFishboneCause" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "category" "SgaFishboneCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SgaFishboneCause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaMeetingReport" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "meetingNumber" INTEGER NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "attendeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaMeetingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaActionItem" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "confirmedRootCause" TEXT NOT NULL,
    "improvementAction" TEXT NOT NULL,
    "responsiblePersonId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaVerification" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "stage" "SgaVerificationStage" NOT NULL,
    "decision" "SgaVerificationDecision" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SgaVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SgaReview" (
    "id" TEXT NOT NULL,
    "sgaId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "statusChanged" "SgaStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SgaReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SgaTeamMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SgaTeamMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SgaOtherDepartments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SgaOtherDepartments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Sga_organizationId_status_idx" ON "Sga"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Sga_employeeId_createdAt_idx" ON "Sga"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Sga_ownerId_idx" ON "Sga"("ownerId");

-- CreateIndex
CREATE INDEX "Sga_mainDepartmentId_status_idx" ON "Sga"("mainDepartmentId", "status");

-- CreateIndex
CREATE INDEX "SgaQcdsmtImpact_sgaId_idx" ON "SgaQcdsmtImpact"("sgaId");

-- CreateIndex
CREATE UNIQUE INDEX "SgaQcdsmtImpact_sgaId_category_key" ON "SgaQcdsmtImpact"("sgaId", "category");

-- CreateIndex
CREATE INDEX "SgaMeasure_sgaId_idx" ON "SgaMeasure"("sgaId");

-- CreateIndex
CREATE INDEX "SgaFishboneCause_sgaId_idx" ON "SgaFishboneCause"("sgaId");

-- CreateIndex
CREATE INDEX "SgaMeetingReport_sgaId_idx" ON "SgaMeetingReport"("sgaId");

-- CreateIndex
CREATE UNIQUE INDEX "SgaMeetingReport_sgaId_meetingNumber_key" ON "SgaMeetingReport"("sgaId", "meetingNumber");

-- CreateIndex
CREATE INDEX "SgaActionItem_sgaId_idx" ON "SgaActionItem"("sgaId");

-- CreateIndex
CREATE INDEX "SgaVerification_sgaId_idx" ON "SgaVerification"("sgaId");

-- CreateIndex
CREATE UNIQUE INDEX "SgaVerification_sgaId_stage_key" ON "SgaVerification"("sgaId", "stage");

-- CreateIndex
CREATE INDEX "_SgaTeamMembers_B_index" ON "_SgaTeamMembers"("B");

-- CreateIndex
CREATE INDEX "_SgaOtherDepartments_B_index" ON "_SgaOtherDepartments"("B");

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_mainDepartmentId_fkey" FOREIGN KEY ("mainDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_hodDecisionById_fkey" FOREIGN KEY ("hodDecisionById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_verifyingDepartmentId_fkey" FOREIGN KEY ("verifyingDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_departmentRepId_fkey" FOREIGN KEY ("departmentRepId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaQcdsmtImpact" ADD CONSTRAINT "SgaQcdsmtImpact_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaMeasure" ADD CONSTRAINT "SgaMeasure_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaFishboneCause" ADD CONSTRAINT "SgaFishboneCause_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaMeetingReport" ADD CONSTRAINT "SgaMeetingReport_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaActionItem" ADD CONSTRAINT "SgaActionItem_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaActionItem" ADD CONSTRAINT "SgaActionItem_responsiblePersonId_fkey" FOREIGN KEY ("responsiblePersonId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaVerification" ADD CONSTRAINT "SgaVerification_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaVerification" ADD CONSTRAINT "SgaVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaReview" ADD CONSTRAINT "SgaReview_sgaId_fkey" FOREIGN KEY ("sgaId") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SgaReview" ADD CONSTRAINT "SgaReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SgaTeamMembers" ADD CONSTRAINT "_SgaTeamMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SgaTeamMembers" ADD CONSTRAINT "_SgaTeamMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SgaOtherDepartments" ADD CONSTRAINT "_SgaOtherDepartments_A_fkey" FOREIGN KEY ("A") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SgaOtherDepartments" ADD CONSTRAINT "_SgaOtherDepartments_B_fkey" FOREIGN KEY ("B") REFERENCES "Sga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

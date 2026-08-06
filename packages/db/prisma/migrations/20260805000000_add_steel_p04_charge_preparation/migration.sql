-- CreateEnum
CREATE TYPE "SteelChargeStage" AS ENUM ('A01_REQUIREMENT_REVIEWED', 'A02_LOTS_SELECTED', 'A03_SCRAP_SORTED', 'A04_SCRAP_CUT', 'A05_CONTAMINANTS_REMOVED', 'A06_ADDITIVES_PREPARED', 'A07_RETURN_SCRAP_CHECKED', 'A08_RECIPE_PREPARED', 'A09_MATERIAL_STAGED', 'A10_VERIFICATION_DONE', 'A11_CHARGE_RELEASED', 'A12_HANDOVER_CLOSED');

-- CreateEnum
CREATE TYPE "SteelChargeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SteelChargeActivity" AS ENUM ('A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12');

-- CreateTable
CREATE TABLE "SteelChargePreparation" (
    "id" TEXT NOT NULL,
    "prepNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "stage" "SteelChargeStage" NOT NULL DEFAULT 'A01_REQUIREMENT_REVIEWED',
    "status" "SteelChargeStatus" NOT NULL DEFAULT 'DRAFT',
    "stockAvailabilityConfirmed" BOOLEAN,
    "requirementNotes" TEXT,
    "lotSelectionNotes" TEXT,
    "sortedWeightTonnes" DOUBLE PRECISION,
    "rejectedItemsNotes" TEXT,
    "scrapGradeNotes" TEXT,
    "cuttingRequired" BOOLEAN,
    "cuttingTimeMinutes" DOUBLE PRECISION,
    "cuttingPowerOrGasUsed" TEXT,
    "cutQuantityTonnes" DOUBLE PRECISION,
    "contaminantsRemoved" BOOLEAN,
    "removedItemsNotes" TEXT,
    "contaminationIssueNotes" TEXT,
    "additivesPrepared" JSONB,
    "additivesNotes" TEXT,
    "returnScrapQtyTonnes" DOUBLE PRECISION,
    "returnScrapSource" TEXT,
    "returnScrapGrade" TEXT,
    "returnScrapContaminationNotes" TEXT,
    "returnScrapAvailable" BOOLEAN,
    "recipeScrapWeightTonnes" DOUBLE PRECISION,
    "recipeDriWeightTonnes" DOUBLE PRECISION,
    "recipeAlloyWeightTonnes" DOUBLE PRECISION,
    "recipeAdditiveWeightTonnes" DOUBLE PRECISION,
    "targetChemistry" JSONB,
    "recipeNotes" TEXT,
    "stagingLocation" TEXT,
    "stagedWeightTonnes" DOUBLE PRECISION,
    "stagingSequence" INTEGER,
    "actualWeightTonnes" DOUBLE PRECISION,
    "actualGrade" TEXT,
    "weightVarianceTonnes" DOUBLE PRECISION,
    "varianceApproved" BOOLEAN,
    "verificationNotes" TEXT,
    "chargeNumber" TEXT,
    "chargeReleasedAt" TIMESTAMP(3),
    "furnaceReadinessConfirmed" BOOLEAN,
    "plannedHeatReference" TEXT,
    "handoverNotes" TEXT,
    "handoverClosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelChargePreparation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelChargeMaterialLot" (
    "id" TEXT NOT NULL,
    "chargePreparationId" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelChargeMaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelChargePreparationActivityLog" (
    "id" TEXT NOT NULL,
    "chargePreparationId" TEXT NOT NULL,
    "activity" "SteelChargeActivity" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelChargePreparationActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SteelChargePreparation_prepNumber_key" ON "SteelChargePreparation"("prepNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SteelChargePreparation_chargeNumber_key" ON "SteelChargePreparation"("chargeNumber");

-- CreateIndex
CREATE INDEX "SteelChargePreparation_organizationId_idx" ON "SteelChargePreparation"("organizationId");

-- CreateIndex
CREATE INDEX "SteelChargePreparation_organizationId_stage_idx" ON "SteelChargePreparation"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "SteelChargePreparation_organizationId_status_idx" ON "SteelChargePreparation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SteelChargePreparation_planId_idx" ON "SteelChargePreparation"("planId");

-- CreateIndex
CREATE INDEX "SteelChargeMaterialLot_chargePreparationId_idx" ON "SteelChargeMaterialLot"("chargePreparationId");

-- CreateIndex
CREATE INDEX "SteelChargeMaterialLot_intakeId_idx" ON "SteelChargeMaterialLot"("intakeId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelChargeMaterialLot_chargePreparationId_intakeId_key" ON "SteelChargeMaterialLot"("chargePreparationId", "intakeId");

-- CreateIndex
CREATE INDEX "SteelChargePreparationActivityLog_chargePreparationId_idx" ON "SteelChargePreparationActivityLog"("chargePreparationId");

-- AddForeignKey
ALTER TABLE "SteelChargePreparation" ADD CONSTRAINT "SteelChargePreparation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelChargePreparation" ADD CONSTRAINT "SteelChargePreparation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SteelProductionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelChargePreparation" ADD CONSTRAINT "SteelChargePreparation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelChargeMaterialLot" ADD CONSTRAINT "SteelChargeMaterialLot_chargePreparationId_fkey" FOREIGN KEY ("chargePreparationId") REFERENCES "SteelChargePreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelChargeMaterialLot" ADD CONSTRAINT "SteelChargeMaterialLot_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SteelMaterialIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelChargePreparationActivityLog" ADD CONSTRAINT "SteelChargePreparationActivityLog_chargePreparationId_fkey" FOREIGN KEY ("chargePreparationId") REFERENCES "SteelChargePreparation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelChargePreparationActivityLog" ADD CONSTRAINT "SteelChargePreparationActivityLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "SteelMeltingStage" AS ENUM ('A01_CONFIRM_FURNACE_AVAILABILITY', 'A02_FURNACE_LINING_CHECK', 'A03_FURNACE_SYSTEMS_CHECK', 'A04_PREVIOUS_HEAT_READINESS', 'A05_VERIFY_CHARGE_RECIPE', 'A06_LOAD_CHARGE', 'A07_START_MELTING', 'A08_MONITOR_POWER', 'A09_MONITOR_TEMPERATURE', 'A10_RECORD_ADDITIONS', 'A11_REMOVE_SLAG', 'A12_RECORD_MELT_OUTPUT', 'A13_CONFIRM_LIQUID_READY', 'A14_HANDOVER_TO_REFINING');

-- CreateEnum
CREATE TYPE "SteelMeltingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SteelMeltingActivity" AS ENUM ('A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14', 'STATUS_OVERRIDE');

-- CreateTable
CREATE TABLE "SteelMelting" (
    "id" TEXT NOT NULL,
    "heatInProcessNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "chargePreparationId" TEXT NOT NULL,
    "stage" "SteelMeltingStage" NOT NULL DEFAULT 'A01_CONFIRM_FURNACE_AVAILABILITY',
    "status" "SteelMeltingStatus" NOT NULL DEFAULT 'DRAFT',
    "chargeNumberSnapshot" TEXT,
    "recipeScrapWeightSnapshot" DOUBLE PRECISION,
    "recipeDriWeightSnapshot" DOUBLE PRECISION,
    "recipeAlloyWeightSnapshot" DOUBLE PRECISION,
    "recipeAdditiveWeightSnapshot" DOUBLE PRECISION,
    "furnaceId" TEXT,
    "plannedHeatRef" TEXT,
    "operatorName" TEXT,
    "shift" TEXT,
    "liningCampaignId" TEXT,
    "liningHeatCount" INTEGER,
    "liningVisualCondition" TEXT,
    "waterPressureFlowOk" BOOLEAN,
    "powerSystemOk" BOOLEAN,
    "hydraulicSystemOk" BOOLEAN,
    "alarmsOk" BOOLEAN,
    "previousHeatRef" TEXT,
    "slagCleaningStatus" TEXT,
    "readinessDelayReason" TEXT,
    "materialLotRef" TEXT,
    "actualWeightVsRecipeOk" BOOLEAN,
    "loadingTime" TIMESTAMP(3),
    "loadingEquipment" TEXT,
    "chargeSequence" TEXT,
    "meltingStartTime" TIMESTAMP(3),
    "meltingFurnaceId" TEXT,
    "meltingOperator" TEXT,
    "meltingChargeId" TEXT,
    "powerKwh" DOUBLE PRECISION,
    "powerElapsedMinutes" DOUBLE PRECISION,
    "powerTonnage" DOUBLE PRECISION,
    "powerInterruptions" TEXT,
    "temperatureCelsius" DOUBLE PRECISION,
    "temperatureElapsedMinutes" DOUBLE PRECISION,
    "temperatureDelayReason" TEXT,
    "additions" JSONB,
    "slagRemovalTime" TIMESTAMP(3),
    "slagQuantityEstimate" DOUBLE PRECISION,
    "slagIssueFound" TEXT,
    "slagNotApplicable" BOOLEAN,
    "outputChargeId" TEXT,
    "outputFurnaceId" TEXT,
    "outputMeltTimeMinutes" DOUBLE PRECISION,
    "outputEnergyTotalKwh" DOUBLE PRECISION,
    "outputAdditionsSummary" TEXT,
    "outputWeightTonnes" DOUBLE PRECISION,
    "liquidReady" BOOLEAN,
    "liquidTemperatureCelsius" DOUBLE PRECISION,
    "liquidOperatorConfirmed" BOOLEAN,
    "handoverToRefiningAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelMelting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelMeltingActivityLog" (
    "id" TEXT NOT NULL,
    "meltingId" TEXT NOT NULL,
    "activity" "SteelMeltingActivity" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelMeltingActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SteelMelting_heatInProcessNumber_key" ON "SteelMelting"("heatInProcessNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SteelMelting_chargePreparationId_key" ON "SteelMelting"("chargePreparationId");

-- CreateIndex
CREATE INDEX "SteelMelting_organizationId_idx" ON "SteelMelting"("organizationId");

-- CreateIndex
CREATE INDEX "SteelMelting_organizationId_stage_idx" ON "SteelMelting"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "SteelMelting_organizationId_status_idx" ON "SteelMelting"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SteelMeltingActivityLog_meltingId_idx" ON "SteelMeltingActivityLog"("meltingId");

-- AddForeignKey
ALTER TABLE "SteelMelting" ADD CONSTRAINT "SteelMelting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMelting" ADD CONSTRAINT "SteelMelting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMelting" ADD CONSTRAINT "SteelMelting_chargePreparationId_fkey" FOREIGN KEY ("chargePreparationId") REFERENCES "SteelChargePreparation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMeltingActivityLog" ADD CONSTRAINT "SteelMeltingActivityLog_meltingId_fkey" FOREIGN KEY ("meltingId") REFERENCES "SteelMelting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMeltingActivityLog" ADD CONSTRAINT "SteelMeltingActivityLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

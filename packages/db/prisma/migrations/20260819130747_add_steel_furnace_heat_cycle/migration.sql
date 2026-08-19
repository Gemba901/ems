-- CreateEnum
CREATE TYPE "FurnaceStatus" AS ENUM ('READY', 'MAINTENANCE', 'DOWN', 'RETIRED');

-- CreateEnum
CREATE TYPE "FurnaceLiningStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "HeatChargeMaterialCategory" AS ENUM ('SCRAP', 'RAW_METAL', 'ALLOY', 'ADDITIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "HeatCycleEventType" AS ENUM ('HEAT_STARTED', 'FURNACE_CHARGING', 'HEATING_STARTED', 'TEMPERATURE_READING', 'MATERIAL_ADDITION', 'ADJUSTMENT', 'ALARM', 'DELAY', 'OPERATOR_INTERVENTION', 'TARGET_TEMPERATURE_REACHED', 'TAPPING_STARTED', 'TAPPING_COMPLETED', 'HEAT_COMPLETED', 'OTHER');

-- AlterTable
ALTER TABLE "SteelMelting" ADD COLUMN     "furnaceRefId" TEXT,
ADD COLUMN     "liningRefId" TEXT;

-- CreateTable
CREATE TABLE "Furnace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "FurnaceStatus" NOT NULL DEFAULT 'READY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Furnace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FurnaceLining" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "furnaceId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL,
    "material" TEXT,
    "heatsCompleted" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT,
    "thicknessRemainingMm" DOUBLE PRECISION,
    "inspectionNotes" TEXT,
    "status" "FurnaceLiningStatus" NOT NULL DEFAULT 'ACTIVE',
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FurnaceLining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatMaterialCharge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meltingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "material" TEXT NOT NULL,
    "materialCategory" "HeatChargeMaterialCategory" NOT NULL,
    "grade" TEXT,
    "batchRef" TEXT,
    "plannedQuantity" DOUBLE PRECISION,
    "actualQuantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "chargedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chargedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeatMaterialCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatCycleEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meltingId" TEXT NOT NULL,
    "eventType" "HeatCycleEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperatureCelsius" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "recordedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeatCycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Furnace_organizationId_idx" ON "Furnace"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Furnace_organizationId_code_key" ON "Furnace"("organizationId", "code");

-- CreateIndex
CREATE INDEX "FurnaceLining_organizationId_idx" ON "FurnaceLining"("organizationId");

-- CreateIndex
CREATE INDEX "FurnaceLining_furnaceId_idx" ON "FurnaceLining"("furnaceId");

-- CreateIndex
CREATE INDEX "HeatMaterialCharge_organizationId_idx" ON "HeatMaterialCharge"("organizationId");

-- CreateIndex
CREATE INDEX "HeatMaterialCharge_meltingId_idx" ON "HeatMaterialCharge"("meltingId");

-- CreateIndex
CREATE INDEX "HeatCycleEvent_organizationId_idx" ON "HeatCycleEvent"("organizationId");

-- CreateIndex
CREATE INDEX "HeatCycleEvent_meltingId_idx" ON "HeatCycleEvent"("meltingId");

-- CreateIndex
CREATE INDEX "HeatCycleEvent_meltingId_occurredAt_idx" ON "HeatCycleEvent"("meltingId", "occurredAt");

-- CreateIndex
CREATE INDEX "SteelMelting_furnaceRefId_idx" ON "SteelMelting"("furnaceRefId");

-- CreateIndex
CREATE INDEX "SteelMelting_liningRefId_idx" ON "SteelMelting"("liningRefId");

-- AddForeignKey
ALTER TABLE "SteelMelting" ADD CONSTRAINT "SteelMelting_furnaceRefId_fkey" FOREIGN KEY ("furnaceRefId") REFERENCES "Furnace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMelting" ADD CONSTRAINT "SteelMelting_liningRefId_fkey" FOREIGN KEY ("liningRefId") REFERENCES "FurnaceLining"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Furnace" ADD CONSTRAINT "Furnace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FurnaceLining" ADD CONSTRAINT "FurnaceLining_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FurnaceLining" ADD CONSTRAINT "FurnaceLining_furnaceId_fkey" FOREIGN KEY ("furnaceId") REFERENCES "Furnace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatMaterialCharge" ADD CONSTRAINT "HeatMaterialCharge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatMaterialCharge" ADD CONSTRAINT "HeatMaterialCharge_meltingId_fkey" FOREIGN KEY ("meltingId") REFERENCES "SteelMelting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatMaterialCharge" ADD CONSTRAINT "HeatMaterialCharge_chargedById_fkey" FOREIGN KEY ("chargedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatCycleEvent" ADD CONSTRAINT "HeatCycleEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatCycleEvent" ADD CONSTRAINT "HeatCycleEvent_meltingId_fkey" FOREIGN KEY ("meltingId") REFERENCES "SteelMelting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatCycleEvent" ADD CONSTRAINT "HeatCycleEvent_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


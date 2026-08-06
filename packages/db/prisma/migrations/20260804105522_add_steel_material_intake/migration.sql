-- CreateEnum
CREATE TYPE "SteelIntakeStage" AS ENUM ('A01_GATE_ARRIVAL_RECORDED', 'A02_DOCUMENTS_VERIFIED', 'A03_GROSS_WEIGHT_CAPTURED', 'A04_SAFETY_CHECKED', 'A05_AREA_ASSIGNED', 'A06_VISUAL_INSPECTED', 'A07_HAZARD_CHECKED', 'A08_RADIATION_CHECKED', 'A09_CERTIFICATE_VERIFIED', 'A10_ACCEPTANCE_DECIDED', 'A11_UNLOADED', 'A12_NET_WEIGHT_CAPTURED', 'A13_YARD_STORED', 'A14_STOCK_RELEASED');

-- CreateEnum
CREATE TYPE "SteelIntakeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'REJECTED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialAcceptanceDecision" AS ENUM ('ACCEPT', 'HOLD', 'REJECT');

-- CreateEnum
CREATE TYPE "SteelIntakeActivity" AS ENUM ('A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14');

-- CreateTable
CREATE TABLE "SteelMaterialIntake" (
    "id" TEXT NOT NULL,
    "intakeNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourcingOrderId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "stage" "SteelIntakeStage" NOT NULL DEFAULT 'A01_GATE_ARRIVAL_RECORDED',
    "status" "SteelIntakeStatus" NOT NULL DEFAULT 'DRAFT',
    "vehicleNumber" TEXT NOT NULL,
    "driverName" TEXT,
    "transporterName" TEXT,
    "arrivalDateTime" TIMESTAMP(3),
    "gateEntryRef" TEXT,
    "purchaseOrderVerified" BOOLEAN,
    "deliveryDocumentRef" TEXT,
    "documentVerificationNotes" TEXT,
    "grossWeightTonnes" DOUBLE PRECISION,
    "grossWeighedAt" TIMESTAMP(3),
    "safetyCheckPassed" BOOLEAN,
    "safetyCheckNotes" TEXT,
    "unloadingArea" TEXT,
    "visualInspectionNotes" TEXT,
    "hazardOrContaminationFound" BOOLEAN,
    "hazardNotes" TEXT,
    "radiationCheckRequired" BOOLEAN,
    "radiationCheckPassed" BOOLEAN,
    "materialType" "SteelMaterialType",
    "grade" TEXT,
    "heatNumber" TEXT,
    "certificateRef" TEXT,
    "acceptanceDecision" "MaterialAcceptanceDecision",
    "decisionNotes" TEXT,
    "unloadedAt" TIMESTAMP(3),
    "tareWeightTonnes" DOUBLE PRECISION,
    "netWeightTonnes" DOUBLE PRECISION,
    "weighedAt" TIMESTAMP(3),
    "yardLocation" TEXT,
    "storedAt" TIMESTAMP(3),
    "stockReleasedAt" TIMESTAMP(3),
    "stockReleaseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelMaterialIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelMaterialIntakeActivityLog" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "activity" "SteelIntakeActivity" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelMaterialIntakeActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SteelMaterialIntake_intakeNumber_key" ON "SteelMaterialIntake"("intakeNumber");

-- CreateIndex
CREATE INDEX "SteelMaterialIntake_organizationId_idx" ON "SteelMaterialIntake"("organizationId");

-- CreateIndex
CREATE INDEX "SteelMaterialIntake_organizationId_stage_idx" ON "SteelMaterialIntake"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "SteelMaterialIntake_organizationId_status_idx" ON "SteelMaterialIntake"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SteelMaterialIntake_sourcingOrderId_idx" ON "SteelMaterialIntake"("sourcingOrderId");

-- CreateIndex
CREATE INDEX "SteelMaterialIntake_createdAt_idx" ON "SteelMaterialIntake"("createdAt");

-- CreateIndex
CREATE INDEX "SteelMaterialIntakeActivityLog_intakeId_idx" ON "SteelMaterialIntakeActivityLog"("intakeId");

-- AddForeignKey
ALTER TABLE "SteelMaterialIntake" ADD CONSTRAINT "SteelMaterialIntake_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMaterialIntake" ADD CONSTRAINT "SteelMaterialIntake_sourcingOrderId_fkey" FOREIGN KEY ("sourcingOrderId") REFERENCES "SteelSourcingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMaterialIntake" ADD CONSTRAINT "SteelMaterialIntake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMaterialIntakeActivityLog" ADD CONSTRAINT "SteelMaterialIntakeActivityLog_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SteelMaterialIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMaterialIntakeActivityLog" ADD CONSTRAINT "SteelMaterialIntakeActivityLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

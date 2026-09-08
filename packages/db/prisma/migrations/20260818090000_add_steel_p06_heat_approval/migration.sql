-- CreateEnum
CREATE TYPE "SteelHeatApprovalStage" AS ENUM ('A01_TAKE_SAMPLE', 'A02_ANALYZE_SAMPLE', 'A03_COMPARE_CHEMISTRY', 'A04_DECIDE_CORRECTION', 'A05_ADD_CORRECTION_MATERIAL', 'A06_RETEST_CHEMISTRY', 'A07_CHECK_TEMPERATURE', 'A08_CHECK_LADLE_READINESS', 'A09_APPROVE_CHEMISTRY_TEMPERATURE', 'A10_CONFIRM_HEAT_NUMBER', 'A11_TAPPING_APPROVAL', 'A12_TAP_TO_LADLE', 'A13_RELEASE_TO_CASTING');

-- CreateEnum
CREATE TYPE "SteelHeatApprovalStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SteelHeatApprovalActivity" AS ENUM ('A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'STATUS_OVERRIDE');

-- CreateTable
CREATE TABLE "SteelHeatApproval" (
    "id" TEXT NOT NULL,
    "approvalNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "meltingId" TEXT NOT NULL,
    "stage" "SteelHeatApprovalStage" NOT NULL DEFAULT 'A01_TAKE_SAMPLE',
    "status" "SteelHeatApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "sampleRef" TEXT,
    "sampleTakenAt" TIMESTAMP(3),
    "chemistryComposition" JSONB,
    "labRef" TEXT,
    "requiredGrade" TEXT,
    "chemistryMatchesGrade" BOOLEAN,
    "chemistryDeviationNotes" TEXT,
    "correctionRequired" BOOLEAN,
    "correctionReason" TEXT,
    "correctionMaterials" JSONB,
    "correctionNotApplicable" BOOLEAN,
    "retestChemistryComposition" JSONB,
    "retestNotApplicable" BOOLEAN,
    "liquidTemperatureCelsius" DOUBLE PRECISION,
    "ladleId" TEXT,
    "ladleLiningCondition" TEXT,
    "ladleReady" BOOLEAN,
    "chemistryTemperatureApproved" BOOLEAN,
    "approvalNotes" TEXT,
    "heatNumber" TEXT,
    "tappingApproved" BOOLEAN,
    "tapStartTime" TIMESTAMP(3),
    "tapEndTime" TIMESTAMP(3),
    "tapOperator" TEXT,
    "releasedToCastingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelHeatApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelHeatApprovalActivityLog" (
    "id" TEXT NOT NULL,
    "heatApprovalId" TEXT NOT NULL,
    "activity" "SteelHeatApprovalActivity" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelHeatApprovalActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SteelHeatApproval_approvalNumber_key" ON "SteelHeatApproval"("approvalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SteelHeatApproval_meltingId_key" ON "SteelHeatApproval"("meltingId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelHeatApproval_heatNumber_key" ON "SteelHeatApproval"("heatNumber");

-- CreateIndex
CREATE INDEX "SteelHeatApproval_organizationId_idx" ON "SteelHeatApproval"("organizationId");

-- CreateIndex
CREATE INDEX "SteelHeatApproval_organizationId_stage_idx" ON "SteelHeatApproval"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "SteelHeatApproval_organizationId_status_idx" ON "SteelHeatApproval"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SteelHeatApprovalActivityLog_heatApprovalId_idx" ON "SteelHeatApprovalActivityLog"("heatApprovalId");

-- AddForeignKey
ALTER TABLE "SteelHeatApproval" ADD CONSTRAINT "SteelHeatApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelHeatApproval" ADD CONSTRAINT "SteelHeatApproval_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelHeatApproval" ADD CONSTRAINT "SteelHeatApproval_meltingId_fkey" FOREIGN KEY ("meltingId") REFERENCES "SteelMelting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelHeatApprovalActivityLog" ADD CONSTRAINT "SteelHeatApprovalActivityLog_heatApprovalId_fkey" FOREIGN KEY ("heatApprovalId") REFERENCES "SteelHeatApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelHeatApprovalActivityLog" ADD CONSTRAINT "SteelHeatApprovalActivityLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

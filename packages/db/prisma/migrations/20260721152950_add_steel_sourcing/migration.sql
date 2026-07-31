-- CreateEnum
CREATE TYPE "SteelMaterialType" AS ENUM ('SCRAP', 'DRI', 'BILLET', 'ALLOY', 'ADDITIVE', 'FUEL', 'REFRACTORY', 'PACKING_MATERIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierApprovalStatus" AS ENUM ('APPROVED', 'PENDING', 'SUSPENDED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "SupplierRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SteelSourcingStage" AS ENUM ('A01_REQUIREMENT_REVIEWED', 'A02_MATERIAL_TYPE_IDENTIFIED', 'A03_SUPPLIER_CHECKED', 'A04_SUPPLIER_RISK_REVIEWED', 'A05_QUOTATIONS_COLLECTED', 'A06_SUPPLIER_SELECTED', 'A07_SPEC_CONFIRMED', 'A08_PO_CREATED', 'A09_DELIVERY_CONFIRMED', 'A10_LOGISTICS_PREPARED', 'A11_INTAKE_INFORMED', 'A12_HANDOVER_CLOSED');

-- CreateEnum
CREATE TYPE "SteelSourcingStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'PO_ISSUED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SteelSourcingActivity" AS ENUM ('A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "materialTypes" "SteelMaterialType"[] DEFAULT ARRAY[]::"SteelMaterialType"[],
    "approvalStatus" "SupplierApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION,
    "deliveryScore" DOUBLE PRECISION,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "country" TEXT,
    "isImportSource" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelSourcingOrder" (
    "id" TEXT NOT NULL,
    "sourcingNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "stage" "SteelSourcingStage" NOT NULL DEFAULT 'A01_REQUIREMENT_REVIEWED',
    "status" "SteelSourcingStatus" NOT NULL DEFAULT 'DRAFT',
    "materialRequirementNotes" TEXT,
    "requiredByDate" TIMESTAMP(3),
    "materialType" "SteelMaterialType",
    "materialTypeNotes" TEXT,
    "supplierId" TEXT,
    "supplierApprovalConfirmed" BOOLEAN,
    "supplierCheckNotes" TEXT,
    "supplierRiskLevel" "SupplierRiskLevel",
    "rejectionRateNotes" TEXT,
    "complaintHistoryNotes" TEXT,
    "quotationsCollectedAt" TIMESTAMP(3),
    "selectedSupplierId" TEXT,
    "qcdComparisonNotes" TEXT,
    "specificationRequirementNotes" TEXT,
    "certificateRequired" BOOLEAN,
    "documentsRequired" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "poNumber" TEXT,
    "poItem" TEXT,
    "poQuantity" DOUBLE PRECISION,
    "poPrice" DOUBLE PRECISION,
    "poCurrency" TEXT,
    "poDeliveryTerms" TEXT,
    "poCreatedAt" TIMESTAMP(3),
    "confirmedDispatchDate" TIMESTAMP(3),
    "confirmedArrivalDate" TIMESTAMP(3),
    "vehicleContainerInfo" TEXT,
    "billOfLading" TEXT,
    "countryOfOrigin" TEXT,
    "portClearanceStatus" TEXT,
    "importLogisticsNotes" TEXT,
    "intakeInformedAt" TIMESTAMP(3),
    "intakeNotifyNotes" TEXT,
    "handoverClosedAt" TIMESTAMP(3),
    "handoverNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelSourcingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelSourcingQuotation" (
    "id" TEXT NOT NULL,
    "sourcingId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantityAvailable" DOUBLE PRECISION,
    "deliveryDate" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "qualityRiskNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelSourcingQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelSourcingActivityLog" (
    "id" TEXT NOT NULL,
    "sourcingId" TEXT NOT NULL,
    "activity" "SteelSourcingActivity" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelSourcingActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_approvalStatus_idx" ON "Supplier"("organizationId", "approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_code_key" ON "Supplier"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SteelSourcingOrder_sourcingNumber_key" ON "SteelSourcingOrder"("sourcingNumber");

-- CreateIndex
CREATE INDEX "SteelSourcingOrder_organizationId_idx" ON "SteelSourcingOrder"("organizationId");

-- CreateIndex
CREATE INDEX "SteelSourcingOrder_organizationId_stage_idx" ON "SteelSourcingOrder"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "SteelSourcingOrder_organizationId_status_idx" ON "SteelSourcingOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SteelSourcingOrder_planId_idx" ON "SteelSourcingOrder"("planId");

-- CreateIndex
CREATE INDEX "SteelSourcingQuotation_sourcingId_idx" ON "SteelSourcingQuotation"("sourcingId");

-- CreateIndex
CREATE INDEX "SteelSourcingActivityLog_sourcingId_idx" ON "SteelSourcingActivityLog"("sourcingId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingOrder" ADD CONSTRAINT "SteelSourcingOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingOrder" ADD CONSTRAINT "SteelSourcingOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SteelProductionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingOrder" ADD CONSTRAINT "SteelSourcingOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingOrder" ADD CONSTRAINT "SteelSourcingOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingQuotation" ADD CONSTRAINT "SteelSourcingQuotation_sourcingId_fkey" FOREIGN KEY ("sourcingId") REFERENCES "SteelSourcingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingQuotation" ADD CONSTRAINT "SteelSourcingQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingActivityLog" ADD CONSTRAINT "SteelSourcingActivityLog_sourcingId_fkey" FOREIGN KEY ("sourcingId") REFERENCES "SteelSourcingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingActivityLog" ADD CONSTRAINT "SteelSourcingActivityLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

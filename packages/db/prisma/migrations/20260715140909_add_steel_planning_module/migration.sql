/*
  Warnings:

  - You are about to drop the `SalesOrder` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "DemandSource" AS ENUM ('CUSTOMER_ORDER', 'DEALER_REQUIREMENT', 'PROJECT_REQUIREMENT', 'FORECAST', 'INTERNAL_STOCK_PLAN');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('NORMAL', 'URGENT', 'EXPORT', 'PROJECT', 'STOCK_REPLENISHMENT');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('APPROVED', 'ON_HOLD', 'PENDING');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('TMT_BAR', 'BILLET', 'WIRE_ROD', 'SECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "StockDecision" AS ENUM ('DISPATCH_FROM_STOCK', 'PRODUCTION_REQUIRED');

-- CreateEnum
CREATE TYPE "PlantRoute" AS ENUM ('INTEGRATED_PLANT', 'SCRAP_BASED_FURNACE_PLANT', 'RE_ROLLER_PLANT', 'OWN_CCM_BILLET_ROUTE', 'LOCAL_PURCHASED_BILLET_ROUTE', 'IMPORTED_BILLET_ROUTE', 'HOT_CHARGE_ROUTE', 'COLD_CHARGE_ROUTE', 'MULTIPLE_ROUTES');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'PARTIAL', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "SteelPlanStage" AS ENUM ('A01_DEMAND_CAPTURED', 'A02_PRIORITY_CONFIRMED', 'A03_PRODUCT_CONFIRMED', 'A04_SPEC_CONFIRMED', 'A05_STOCK_CHECKED', 'A06_STOCK_DECISION_MADE', 'A07_ROUTE_SELECTED', 'A08_MATERIAL_CHECKED', 'A09_CAPACITY_CHECKED', 'A10_PLAN_DRAFTED', 'A11_PLAN_COMMUNICATED', 'A12_PLAN_RELEASED');

-- CreateEnum
CREATE TYPE "SteelPlanOverallStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'ON_HOLD', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SteelPlanActivity" AS ENUM ('A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12');

-- CreateEnum
CREATE TYPE "SteelDepartment" AS ENUM ('PROCUREMENT', 'YARD', 'FURNACE', 'CCM', 'ROLLING', 'QUALITY', 'MAINTENANCE', 'STORES', 'DISPATCH');

-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE 'STEEL';

-- DropTable
DROP TABLE "SalesOrder";

-- DropEnum
DROP TYPE "SalesOrderStatus";

-- CreateTable
CREATE TABLE "SteelProductionPlan" (
    "id" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "stage" "SteelPlanStage" NOT NULL DEFAULT 'A01_DEMAND_CAPTURED',
    "status" "SteelPlanOverallStatus" NOT NULL DEFAULT 'DRAFT',
    "demandSource" "DemandSource" NOT NULL,
    "customerName" TEXT,
    "dealerName" TEXT,
    "projectReference" TEXT,
    "salesOrderNumber" TEXT,
    "forecastReference" TEXT,
    "stockRequirementReference" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "requestedQuantityTonnes" DOUBLE PRECISION NOT NULL,
    "demandNotes" TEXT,
    "priority" "OrderPriority",
    "deliveryPromiseDate" TIMESTAMP(3),
    "creditStatus" "CreditStatus",
    "productType" "ProductType",
    "productStandard" TEXT,
    "customerSpecification" TEXT,
    "grade" TEXT,
    "size" TEXT,
    "length" TEXT,
    "bundleType" TEXT,
    "totalQuantity" DOUBLE PRECISION,
    "toleranceNotes" TEXT,
    "certifiedStockAvailableQty" DOUBLE PRECISION,
    "stockBundleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stockHeatNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stockCertificateRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stockDecision" "StockDecision",
    "stockDecisionNotes" TEXT,
    "plantRoute" "PlantRoute",
    "routeNotes" TEXT,
    "materialAvailability" "AvailabilityStatus",
    "materialShortageNotes" TEXT,
    "purchaseRequirementNotes" TEXT,
    "equipmentAvailability" "AvailabilityStatus",
    "manpowerAvailability" "AvailabilityStatus",
    "maintenanceShutdownNotes" TEXT,
    "shiftPlanNotes" TEXT,
    "productionSequence" JSONB,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "planNotes" TEXT,
    "planCommunicatedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "releaseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelPlanActivityLog" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "activity" "SteelPlanActivity" NOT NULL,
    "performedById" TEXT NOT NULL,
    "notes" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelPlanActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelPlanDepartmentAck" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "department" "SteelDepartment" NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelPlanDepartmentAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SteelProductionPlan_planNumber_key" ON "SteelProductionPlan"("planNumber");

-- CreateIndex
CREATE INDEX "SteelProductionPlan_organizationId_idx" ON "SteelProductionPlan"("organizationId");

-- CreateIndex
CREATE INDEX "SteelProductionPlan_organizationId_stage_idx" ON "SteelProductionPlan"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "SteelProductionPlan_organizationId_status_idx" ON "SteelProductionPlan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SteelPlanActivityLog_planId_idx" ON "SteelPlanActivityLog"("planId");

-- CreateIndex
CREATE INDEX "SteelPlanDepartmentAck_planId_idx" ON "SteelPlanDepartmentAck"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelPlanDepartmentAck_planId_department_key" ON "SteelPlanDepartmentAck"("planId", "department");

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelPlanActivityLog" ADD CONSTRAINT "SteelPlanActivityLog_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SteelProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelPlanActivityLog" ADD CONSTRAINT "SteelPlanActivityLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelPlanDepartmentAck" ADD CONSTRAINT "SteelPlanDepartmentAck_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SteelProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelPlanDepartmentAck" ADD CONSTRAINT "SteelPlanDepartmentAck_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

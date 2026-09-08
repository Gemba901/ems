-- AlterTable
ALTER TABLE "SteelProductionPlan" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dealerName" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "creditStatus" "CreditStatus",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockFulfilmentItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "material" TEXT,
    "bundleId" TEXT,
    "heatNumber" TEXT,
    "certificateRef" TEXT,
    "quantityTonnes" DOUBLE PRECISION,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockFulfilmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_name_key" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE INDEX "StockFulfilmentItem_organizationId_idx" ON "StockFulfilmentItem"("organizationId");

-- CreateIndex
CREATE INDEX "StockFulfilmentItem_planId_idx" ON "StockFulfilmentItem"("planId");

-- CreateIndex
CREATE INDEX "SteelProductionPlan_customerId_idx" ON "SteelProductionPlan"("customerId");

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockFulfilmentItem" ADD CONSTRAINT "StockFulfilmentItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockFulfilmentItem" ADD CONSTRAINT "StockFulfilmentItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SteelProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

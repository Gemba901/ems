/*
  Warnings:

  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PLANNED', 'APPROVED', 'CANCELLED');

-- DropTable
DROP TABLE "Product";

-- DropEnum
DROP TYPE "ProductCategory";

-- DropEnum
DROP TYPE "ProductStatus";

-- DropEnum
DROP TYPE "ProductUnit";

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "demandSource" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_key" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_orderNumber_idx" ON "SalesOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_customerName_idx" ON "SalesOrder"("customerName");

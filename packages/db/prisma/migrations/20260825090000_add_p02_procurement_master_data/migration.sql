-- CreateEnum
CREATE TYPE "SteelProcurementType" AS ENUM ('LOCAL', 'IMPORT', 'BOTH');

-- CreateEnum
CREATE TYPE "SteelLookupType" AS ENUM ('PAYMENT_TERMS', 'INCOTERM', 'CURRENCY', 'TRANSPORT_MODE', 'DELIVERY_LOCATION', 'DOCUMENT_TYPE');

-- AlterTable
ALTER TABLE "SteelMaterialMaster" ADD COLUMN     "category" TEXT,
ADD COLUMN     "frequentlySourced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "materialType" "SteelMaterialType",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "procurementType" "SteelProcurementType",
ADD COLUMN     "requiredDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "specificationReference" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SteelLookup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SteelLookupType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelLookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelSupplierMaterial" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "specificationReference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelSupplierMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelQcdCriteria" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qualityWeight" DOUBLE PRECISION NOT NULL,
    "costWeight" DOUBLE PRECISION NOT NULL,
    "deliveryWeight" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelQcdCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SteelLookup_organizationId_type_idx" ON "SteelLookup"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SteelLookup_organizationId_type_code_key" ON "SteelLookup"("organizationId", "type", "code");

-- CreateIndex
CREATE INDEX "SteelSupplierMaterial_organizationId_idx" ON "SteelSupplierMaterial"("organizationId");

-- CreateIndex
CREATE INDEX "SteelSupplierMaterial_materialId_idx" ON "SteelSupplierMaterial"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelSupplierMaterial_supplierId_materialId_key" ON "SteelSupplierMaterial"("supplierId", "materialId");

-- CreateIndex
CREATE INDEX "SteelQcdCriteria_organizationId_idx" ON "SteelQcdCriteria"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelQcdCriteria_organizationId_name_key" ON "SteelQcdCriteria"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "SteelLookup" ADD CONSTRAINT "SteelLookup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSupplierMaterial" ADD CONSTRAINT "SteelSupplierMaterial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSupplierMaterial" ADD CONSTRAINT "SteelSupplierMaterial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSupplierMaterial" ADD CONSTRAINT "SteelSupplierMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "SteelMaterialMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelQcdCriteria" ADD CONSTRAINT "SteelQcdCriteria_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SteelProductionPlan" ADD COLUMN     "productId" TEXT,
ADD COLUMN     "productSpecificationId" TEXT,
ADD COLUMN     "productionRouteId" TEXT;

-- CreateTable
CREATE TABLE "SteelProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelProductSpecification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "length" TEXT,
    "toleranceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelProductSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelProductionRoute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plantRoute" "PlantRoute" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelProductionRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelProductionRouteStep" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "processName" TEXT NOT NULL,
    "department" "SteelDepartment" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelProductionRouteStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelMaterialMaster" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelMaterialMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteelFinishedGoodsStock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productSpecificationId" TEXT NOT NULL,
    "certifiedQtyTonnes" DOUBLE PRECISION NOT NULL,
    "bundleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heatNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certificateRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteelFinishedGoodsStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SteelProduct_organizationId_idx" ON "SteelProduct"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelProduct_organizationId_code_key" ON "SteelProduct"("organizationId", "code");

-- CreateIndex
CREATE INDEX "SteelProductSpecification_organizationId_idx" ON "SteelProductSpecification"("organizationId");

-- CreateIndex
CREATE INDEX "SteelProductSpecification_productId_idx" ON "SteelProductSpecification"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelProductSpecification_organizationId_code_key" ON "SteelProductSpecification"("organizationId", "code");

-- CreateIndex
CREATE INDEX "SteelProductionRoute_organizationId_idx" ON "SteelProductionRoute"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelProductionRoute_organizationId_code_key" ON "SteelProductionRoute"("organizationId", "code");

-- CreateIndex
CREATE INDEX "SteelProductionRouteStep_routeId_idx" ON "SteelProductionRouteStep"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelProductionRouteStep_routeId_sequence_key" ON "SteelProductionRouteStep"("routeId", "sequence");

-- CreateIndex
CREATE INDEX "SteelMaterialMaster_organizationId_idx" ON "SteelMaterialMaster"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SteelMaterialMaster_organizationId_code_key" ON "SteelMaterialMaster"("organizationId", "code");

-- CreateIndex
CREATE INDEX "SteelFinishedGoodsStock_organizationId_idx" ON "SteelFinishedGoodsStock"("organizationId");

-- CreateIndex
CREATE INDEX "SteelFinishedGoodsStock_productSpecificationId_idx" ON "SteelFinishedGoodsStock"("productSpecificationId");

-- AddForeignKey
ALTER TABLE "SteelProduct" ADD CONSTRAINT "SteelProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductSpecification" ADD CONSTRAINT "SteelProductSpecification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductSpecification" ADD CONSTRAINT "SteelProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SteelProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionRoute" ADD CONSTRAINT "SteelProductionRoute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionRouteStep" ADD CONSTRAINT "SteelProductionRouteStep_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "SteelProductionRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMaterialMaster" ADD CONSTRAINT "SteelMaterialMaster_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelFinishedGoodsStock" ADD CONSTRAINT "SteelFinishedGoodsStock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelFinishedGoodsStock" ADD CONSTRAINT "SteelFinishedGoodsStock_productSpecificationId_fkey" FOREIGN KEY ("productSpecificationId") REFERENCES "SteelProductSpecification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SteelProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_productSpecificationId_fkey" FOREIGN KEY ("productSpecificationId") REFERENCES "SteelProductSpecification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelProductionPlan" ADD CONSTRAINT "SteelProductionPlan_productionRouteId_fkey" FOREIGN KEY ("productionRouteId") REFERENCES "SteelProductionRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

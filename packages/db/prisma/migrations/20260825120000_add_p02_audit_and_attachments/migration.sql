-- AlterTable
ALTER TABLE "SteelLookup" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "SteelMaterialMaster" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "SteelQcdCriteria" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "SteelSupplierMaterial" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "SteelSourcingAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourcingId" TEXT NOT NULL,
    "stage" "SteelSourcingStage" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelSourcingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SteelSourcingAttachment_sourcingId_idx" ON "SteelSourcingAttachment"("sourcingId");

-- CreateIndex
CREATE INDEX "SteelSourcingAttachment_organizationId_idx" ON "SteelSourcingAttachment"("organizationId");

-- AddForeignKey
ALTER TABLE "SteelMaterialMaster" ADD CONSTRAINT "SteelMaterialMaster_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelMaterialMaster" ADD CONSTRAINT "SteelMaterialMaster_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelLookup" ADD CONSTRAINT "SteelLookup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelLookup" ADD CONSTRAINT "SteelLookup_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSupplierMaterial" ADD CONSTRAINT "SteelSupplierMaterial_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSupplierMaterial" ADD CONSTRAINT "SteelSupplierMaterial_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelQcdCriteria" ADD CONSTRAINT "SteelQcdCriteria_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelQcdCriteria" ADD CONSTRAINT "SteelQcdCriteria_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingAttachment" ADD CONSTRAINT "SteelSourcingAttachment_sourcingId_fkey" FOREIGN KEY ("sourcingId") REFERENCES "SteelSourcingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteelSourcingAttachment" ADD CONSTRAINT "SteelSourcingAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

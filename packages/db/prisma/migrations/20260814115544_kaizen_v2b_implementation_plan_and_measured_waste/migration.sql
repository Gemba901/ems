-- Kaizen v2b: implementation-plan section, measured waste rows, currency pairing.
-- Staging holds 4 Kaizen rows total, none with wastesReduced or financialSavingAmount
-- set, so both columns are dropped directly with no data migration needed.

-- AlterTable
ALTER TABLE "Kaizen" DROP COLUMN "financialSavingAmount",
DROP COLUMN "wastesReduced",
ADD COLUMN     "estimatedCost" DECIMAL(14,2),
ADD COLUMN     "estimatedCostCurrency" TEXT,
ADD COLUMN     "requiredMaterials" TEXT;

-- AlterTable
ALTER TABLE "KaizenQcdsmtImpact" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "KaizenVerification" ADD COLUMN     "verifiedBenefitAmount" DECIMAL(14,2),
ADD COLUMN     "verifiedBenefitCurrency" TEXT;

-- CreateTable
CREATE TABLE "KaizenWasteImpact" (
    "id" TEXT NOT NULL,
    "kaizenId" TEXT NOT NULL,
    "waste" "KaizenWaste" NOT NULL,
    "whatIsMeasured" TEXT NOT NULL,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "unit" "KaizenUnit" NOT NULL,
    "otherUnitLabel" TEXT,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KaizenWasteImpact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KaizenWasteImpact_kaizenId_idx" ON "KaizenWasteImpact"("kaizenId");

-- CreateIndex
CREATE UNIQUE INDEX "KaizenWasteImpact_kaizenId_waste_key" ON "KaizenWasteImpact"("kaizenId", "waste");

-- AddForeignKey
ALTER TABLE "KaizenWasteImpact" ADD CONSTRAINT "KaizenWasteImpact_kaizenId_fkey" FOREIGN KEY ("kaizenId") REFERENCES "Kaizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "deduplicationKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Alert_deduplicationKey_key" ON "Alert"("deduplicationKey");

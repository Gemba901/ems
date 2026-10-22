-- AlterEnum
ALTER TYPE "FiveSActionEventType" ADD VALUE 'KAIZEN_RAISED';

-- AlterTable
ALTER TABLE "Kaizen" ADD COLUMN     "sourceFiveSActionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Kaizen_sourceFiveSActionId_key" ON "Kaizen"("sourceFiveSActionId");

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_sourceFiveSActionId_fkey" FOREIGN KEY ("sourceFiveSActionId") REFERENCES "FiveSAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "TaskSourceModule" AS ENUM ('KAIZEN', 'SGA', 'SGA_MEETING', 'FIVE_S_ROUTINE', 'FIVE_S_STEP');

-- AlterEnum
ALTER TYPE "SgaStartingReason" ADD VALUE 'EMPLOYEE_SUGGESTION_SELECTED_FOR_SGA';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceModule" "TaskSourceModule",
ADD COLUMN     "sourceParentId" TEXT,
ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "Suggestion" ADD COLUMN     "linkedSgaId" TEXT;

-- CreateIndex
CREATE INDEX "Task_sourceModule_sourceParentId_idx" ON "Task"("sourceModule", "sourceParentId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_sourceModule_sourceId_key" ON "Task"("sourceModule", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Kaizen_linkedSgaId_key" ON "Kaizen"("linkedSgaId");

-- CreateIndex
CREATE UNIQUE INDEX "Suggestion_linkedSgaId_key" ON "Suggestion"("linkedSgaId");

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_linkedSgaId_fkey" FOREIGN KEY ("linkedSgaId") REFERENCES "Sga"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_linkedSgaId_fkey" FOREIGN KEY ("linkedSgaId") REFERENCES "Sga"("id") ON DELETE SET NULL ON UPDATE CASCADE;


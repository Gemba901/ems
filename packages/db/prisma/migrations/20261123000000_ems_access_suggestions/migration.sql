-- EMS access: everyone registers as Employee; the import's access value becomes a suggestion an Admin decides.
-- Additive only: new columns default to empty, existing roles and memberships are untouched.

-- CreateEnum
CREATE TYPE "EmsAccessSuggestionState" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "suggestedAccess" "RoleName",
ADD COLUMN     "suggestedAccessState" "EmsAccessSuggestionState",
ADD COLUMN     "accessRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EmsAccessChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT,
    "subjectEmployeeId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(20) NOT NULL,
    "fromRole" "RoleName",
    "toRole" "RoleName",
    "suggestedRole" "RoleName",
    "reason" VARCHAR(500) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmsAccessChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmsImportValueChoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "valueKey" VARCHAR(200) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "choice" VARCHAR(40) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmsImportValueChoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmsAccessChange_organizationId_employeeId_changedAt_idx" ON "EmsAccessChange"("organizationId", "employeeId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmsImportValueChoice_organizationId_field_valueKey_key" ON "EmsImportValueChoice"("organizationId", "field", "valueKey");

-- AddForeignKey
ALTER TABLE "EmsAccessChange" ADD CONSTRAINT "EmsAccessChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

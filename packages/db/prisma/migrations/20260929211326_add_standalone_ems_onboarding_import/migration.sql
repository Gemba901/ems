-- CreateEnum
CREATE TYPE "EmsOnboardingBatchStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY', 'PARTIALLY_REGISTERED', 'REGISTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmsOnboardingRecordStatus" AS ENUM ('DRAFT', 'NEEDS_FIXING', 'READY', 'REGISTERED', 'EXCLUDED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "beesAccessLevel" TEXT,
ADD COLUMN     "companyCode" TEXT,
ADD COLUMN     "firstRelieverId" TEXT,
ADD COLUMN     "hodDesignation" TEXT,
ADD COLUMN     "hodName" TEXT,
ADD COLUMN     "secondRelieverId" TEXT;

-- CreateTable
CREATE TABLE "EmsOnboardingBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT,
    "sourceFileName" TEXT,
    "status" "EmsOnboardingBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmsOnboardingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmsOnboardingRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "companyCode" TEXT,
    "plantBranchCode" TEXT,
    "employeeCode" TEXT,
    "firstName" TEXT,
    "mobileNumber" TEXT,
    "companyEmail" TEXT,
    "gender" TEXT,
    "nationality" TEXT,
    "currentDepartment" TEXT,
    "hodName" TEXT,
    "hodDesignation" TEXT,
    "workArea" TEXT,
    "subSection" TEXT,
    "jobDesignation" TEXT,
    "beesAccessLevel" TEXT,
    "shift" TEXT,
    "reportingToName" TEXT,
    "reportingToDesignation" TEXT,
    "employmentStatus" TEXT,
    "employmentType" TEXT,
    "reliever1Name" TEXT,
    "reliever1Designation" TEXT,
    "reliever2Name" TEXT,
    "reliever2Designation" TEXT,
    "status" "EmsOnboardingRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "validationErrors" JSONB,
    "exclusionReason" TEXT,
    "employeeId" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmsOnboardingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmsOnboardingBatch_organizationId_idx" ON "EmsOnboardingBatch"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EmsOnboardingRecord_employeeId_key" ON "EmsOnboardingRecord"("employeeId");

-- CreateIndex
CREATE INDEX "EmsOnboardingRecord_batchId_idx" ON "EmsOnboardingRecord"("batchId");

-- CreateIndex
CREATE INDEX "EmsOnboardingRecord_organizationId_idx" ON "EmsOnboardingRecord"("organizationId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_firstRelieverId_fkey" FOREIGN KEY ("firstRelieverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_secondRelieverId_fkey" FOREIGN KEY ("secondRelieverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsOnboardingBatch" ADD CONSTRAINT "EmsOnboardingBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsOnboardingBatch" ADD CONSTRAINT "EmsOnboardingBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EmsOnboardingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

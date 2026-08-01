/*
  Warnings:

  - A unique constraint covering the columns `[abnormalitySourceAlertId]` on the table `Alert` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AlertClosureApprovalStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "abnormalitySourceAlertId" TEXT,
ADD COLUMN     "closureApprovalStatus" "AlertClosureApprovalStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "closureApproverId" TEXT,
ADD COLUMN     "closureRejectedAt" TIMESTAMP(3),
ADD COLUMN     "closureRejectionNote" TEXT,
ADD COLUMN     "closureRequestedAt" TIMESTAMP(3),
ADD COLUMN     "closureRequestedById" TEXT,
ADD COLUMN     "isAbnormality" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CalendarEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DwmsPermissionConfig" ADD COLUMN     "abnormalityCriticalMins" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "abnormalityHighMins" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN     "abnormalityMediumMins" INTEGER NOT NULL DEFAULT 1440;

-- AlterTable
ALTER TABLE "EventInvitation" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EventParticipant" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "activityId" TEXT,
ADD COLUMN     "completionDocumentName" TEXT,
ADD COLUMN     "requiresCompletionDocument" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TaskInstance" ADD COLUMN     "completionAttachmentName" TEXT,
ADD COLUMN     "completionAttachmentUrl" TEXT,
ADD COLUMN     "completionNote" TEXT;

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyUnitName" TEXT,
    "mainDepartmentId" TEXT,
    "subDepartment" TEXT,
    "gembaSection" TEXT,
    "processArea" TEXT,
    "name" TEXT NOT NULL,
    "workMethod" TEXT,
    "code" TEXT NOT NULL,
    "purpose" TEXT,
    "category" TEXT,
    "frequency" "TaskFrequency" NOT NULL,
    "startTrigger" TEXT,
    "completionDeadline" TEXT,
    "completionOutput" TEXT,
    "primaryResponsibleDesignation" TEXT,
    "primaryResponsibleEmployeeId" TEXT,
    "parentActivityId" TEXT,
    "evidenceRequired" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityIngestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successfulRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ActivityIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityIngestionRow" (
    "id" TEXT NOT NULL,
    "ingestionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "activityName" TEXT,
    "activityCode" TEXT,
    "responsibleEmployeeCode" TEXT,
    "message" TEXT,
    "activityId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityIngestionRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstanceComment" (
    "id" TEXT NOT NULL,
    "taskInstanceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskInstanceComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstanceEvent" (
    "id" TEXT NOT NULL,
    "taskInstanceId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" "TaskStatus",
    "toStatus" "TaskStatus",
    "note" TEXT,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskInstanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertComment" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_organizationId_status_idx" ON "Activity"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Activity_mainDepartmentId_idx" ON "Activity"("mainDepartmentId");

-- CreateIndex
CREATE INDEX "Activity_primaryResponsibleEmployeeId_idx" ON "Activity"("primaryResponsibleEmployeeId");

-- CreateIndex
CREATE INDEX "Activity_parentActivityId_idx" ON "Activity"("parentActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_organizationId_code_key" ON "Activity"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ActivityIngestion_organizationId_createdAt_idx" ON "ActivityIngestion"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityIngestion_uploadedById_idx" ON "ActivityIngestion"("uploadedById");

-- CreateIndex
CREATE INDEX "ActivityIngestion_status_idx" ON "ActivityIngestion"("status");

-- CreateIndex
CREATE INDEX "ActivityIngestionRow_organizationId_status_idx" ON "ActivityIngestionRow"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ActivityIngestionRow_activityId_idx" ON "ActivityIngestionRow"("activityId");

-- CreateIndex
CREATE INDEX "ActivityIngestionRow_taskId_idx" ON "ActivityIngestionRow"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityIngestionRow_ingestionId_rowNumber_key" ON "ActivityIngestionRow"("ingestionId", "rowNumber");

-- CreateIndex
CREATE INDEX "TaskInstanceComment_taskInstanceId_idx" ON "TaskInstanceComment"("taskInstanceId");

-- CreateIndex
CREATE INDEX "TaskInstanceComment_authorId_idx" ON "TaskInstanceComment"("authorId");

-- CreateIndex
CREATE INDEX "TaskInstanceEvent_taskInstanceId_idx" ON "TaskInstanceEvent"("taskInstanceId");

-- CreateIndex
CREATE INDEX "TaskInstanceEvent_actorId_idx" ON "TaskInstanceEvent"("actorId");

-- CreateIndex
CREATE INDEX "TaskInstanceEvent_type_idx" ON "TaskInstanceEvent"("type");

-- CreateIndex
CREATE INDEX "AlertComment_alertId_idx" ON "AlertComment"("alertId");

-- CreateIndex
CREATE INDEX "AlertComment_authorId_idx" ON "AlertComment"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_abnormalitySourceAlertId_key" ON "Alert"("abnormalitySourceAlertId");

-- CreateIndex
CREATE INDEX "Alert_isAbnormality_idx" ON "Alert"("isAbnormality");

-- CreateIndex
CREATE INDEX "Alert_closureApproverId_closureApprovalStatus_idx" ON "Alert"("closureApproverId", "closureApprovalStatus");

-- CreateIndex
CREATE INDEX "Alert_closureRequestedById_idx" ON "Alert"("closureRequestedById");

-- CreateIndex
CREATE INDEX "Task_activityId_idx" ON "Task"("activityId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_mainDepartmentId_fkey" FOREIGN KEY ("mainDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_primaryResponsibleEmployeeId_fkey" FOREIGN KEY ("primaryResponsibleEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_parentActivityId_fkey" FOREIGN KEY ("parentActivityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIngestion" ADD CONSTRAINT "ActivityIngestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIngestion" ADD CONSTRAINT "ActivityIngestion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIngestionRow" ADD CONSTRAINT "ActivityIngestionRow_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "ActivityIngestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIngestionRow" ADD CONSTRAINT "ActivityIngestionRow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIngestionRow" ADD CONSTRAINT "ActivityIngestionRow_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIngestionRow" ADD CONSTRAINT "ActivityIngestionRow_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstanceComment" ADD CONSTRAINT "TaskInstanceComment_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "TaskInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstanceComment" ADD CONSTRAINT "TaskInstanceComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstanceEvent" ADD CONSTRAINT "TaskInstanceEvent_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "TaskInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstanceEvent" ADD CONSTRAINT "TaskInstanceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertComment" ADD CONSTRAINT "AlertComment_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertComment" ADD CONSTRAINT "AlertComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

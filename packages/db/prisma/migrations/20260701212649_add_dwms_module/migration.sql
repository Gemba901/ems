/*
  Warnings:

  - You are about to drop the column `committeeId` on the `Suggestion` table. All the data in the column will be lost.
  - You are about to drop the column `reviewerCommitteeId` on the `SuggestionReview` table. All the data in the column will be lost.
  - Made the column `name` on table `Role` required. This step will fail if there are existing NULL values in that column.
  - Made the column `roleId` on table `RolePermission` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
-- NotificationType may already exist (see 20260702_add_notification_table),
-- which was merged after this migration was first generated.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('ACTION_REQUIRED', 'INFO', 'REMINDER', 'ALERT');
  END IF;
END $$;

-- CreateEnum
-- ImplementationStatus may already exist (see
-- 20260702_reconcile_suggestion_hod_review_and_employee_notifications).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImplementationStatus') THEN
    CREATE TYPE "ImplementationStatus" AS ENUM ('WORK_IN_PROGRESS', 'VERY_SLOW_WORK_IN_PROGRESS', 'GOOD_WORK_IN_PROGRESS', 'SLOW_PROGRESS', 'IMPLEMENTED', 'SHIFTED_TO_SGA', 'PREVIOUSLY_IMPLEMENTED', 'UNDER_CONSULTATION', 'IMPRACTICAL', 'SAVED_FOR_LATER');
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BREAKDOWN', 'DELAY', 'QUALITY_ISSUE', 'WRONG_ENTRY', 'WRONG_DELIVERY', 'SAFETY_CONCERN', 'PROCESS_DEVIATION', 'MISSED_ACTIVITY', 'REPEATED_PROBLEM', 'DISCIPLINE_ISSUE', 'ABNORMAL_SITUATION');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "TaskFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'PLANNED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'APPROVAL_PENDING', 'PARTLY_DONE', 'LESS_THAN_50', 'NOT_APPLICABLE', 'OVERDUE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OverdueAlertTo" AS ENUM ('ASSIGNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "ViewLevel" AS ENUM ('OWN', 'DEPARTMENT', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "EscalationContactRule" AS ENUM ('ASSIGNER', 'MANAGER', 'HOD', 'HIGHER_LEVEL_MANAGERS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TaskPermissionRole" AS ENUM ('ADMIN', 'MANAGEMENT', 'HOD', 'DIRECT_MANAGER', 'HIGHER_LEVEL_MANAGERS', 'OWNER', 'ANYONE', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_handoverEmployee2Id_fkey";

-- DropForeignKey
-- may already be renamed to LeaveSettings_organizationId_fkey on environments
-- where this migration was never applied but a later-dated one touched the
-- same column (out-of-order branch merge).
ALTER TABLE "LeaveSettings" DROP CONSTRAINT IF EXISTS "LeaveSettings_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Suggestion" DROP CONSTRAINT IF EXISTS "Suggestion_committeeId_fkey";

-- DropForeignKey
-- reviewerCommitteeId may already have been dropped (see
-- 20260702_reconcile_suggestion_hod_review_and_employee_notifications).
ALTER TABLE "SuggestionReview" DROP CONSTRAINT IF EXISTS "SuggestionReview_reviewerCommitteeId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "ConsultancyVisit_clientOrgId_date_idx";

-- DropIndex
DROP INDEX IF EXISTS "ConsultancyVisit_date_idx";

-- DropIndex
DROP INDEX IF EXISTS "LeaveRequest_handoverEmployeeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "VisitRequest_organizationId_idx";

-- DropIndex
DROP INDEX IF EXISTS "quotes_active_idx";

-- DropIndex
DROP INDEX IF EXISTS "quotes_timeOfDay_idx";

-- AlterTable
ALTER TABLE "CalendarEvent" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
-- may already exist (see 20260702_add_org_shortname_visit_reschedule_count).
ALTER TABLE "ConsultancyVisit" ADD COLUMN IF NOT EXISTS "rescheduleCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EventInvitation" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EventParticipant" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeaveBalance" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeaveRequest" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeaveSettings" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Notice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
-- may already exist (see 20260702_add_org_shortname_visit_reschedule_count).
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "shortName" TEXT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
-- RolePermission_pkey may already have been added on environments where this
-- migration was never applied but a later-dated one touched the same table.
ALTER TABLE "RolePermission" ALTER COLUMN "roleId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'RolePermission_pkey' AND cl.relname = 'RolePermission'
  ) THEN
    ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId");
  END IF;
END $$;

-- AlterTable
-- committeeId drop and hodId/implementationNote/implementationStatus adds
-- may already be applied (see 20260702_reconcile_suggestion_hod_review_and_employee_notifications).
ALTER TABLE "Suggestion" DROP COLUMN IF EXISTS "committeeId";
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "hodId" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "implementationNote" TEXT;
ALTER TABLE "Suggestion" ADD COLUMN IF NOT EXISTS "implementationStatus" "ImplementationStatus";

-- AlterTable
ALTER TABLE "SuggestionReview" DROP COLUMN IF EXISTS "reviewerCommitteeId";

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
-- Notification may already exist (see 20260702_add_notification_table).
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "module" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "frequency" "TaskFrequency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedById" TEXT,
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledgedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "completionAttachmentUrl" TEXT,
    "completionAttachmentName" TEXT,
    "dueDate" TIMESTAMP(3),
    "isAdhoc" BOOLEAN NOT NULL DEFAULT false,
    "priority" "Priority" DEFAULT 'MEDIUM',
    "departmentId" TEXT,
    "ownerName" TEXT,
    "assignedByName" TEXT,
    "approvedById" TEXT,
    "overdueAlertTo" "OverdueAlertTo" NOT NULL DEFAULT 'ASSIGNER',
    "backupOwnerId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskInstance" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "frequency" "TaskFrequency" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "organizationId" TEXT,
    "severity" "Severity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "correctiveAction" TEXT,
    "closureNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "taskInstanceId" TEXT,
    "departmentId" TEXT,
    "againstUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DwmsPermissionConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "approverRoles" "TaskPermissionRole"[] DEFAULT ARRAY[]::"TaskPermissionRole"[],
    "approverCustomEmployeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alertViewLevel" "ViewLevel" NOT NULL DEFAULT 'OWN',
    "analyticsViewLevel" "ViewLevel" NOT NULL DEFAULT 'DEPARTMENT',
    "escalateUnacknowledgedMediumMins" INTEGER NOT NULL DEFAULT 1440,
    "escalateUnacknowledgedHighMins" INTEGER NOT NULL DEFAULT 480,
    "escalateUnacknowledgedCriticalMins" INTEGER NOT NULL DEFAULT 120,
    "escalateUnacknowledgedMins" INTEGER NOT NULL DEFAULT 60,
    "escalationContactRules" "EscalationContactRule"[] DEFAULT ARRAY[]::"EscalationContactRule"[],
    "customEscalationContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DwmsPermissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_employeeId_isRead_idx" ON "Notification"("employeeId", "isRead");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_employeeId_createdAt_idx" ON "Notification"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_employeeId_module_idx" ON "Notification"("employeeId", "module");

-- CreateIndex
CREATE INDEX "Task_ownerId_idx" ON "Task"("ownerId");

-- CreateIndex
CREATE INDEX "Task_assignedById_idx" ON "Task"("assignedById");

-- CreateIndex
CREATE INDEX "Task_departmentId_idx" ON "Task"("departmentId");

-- CreateIndex
CREATE INDEX "Task_approvedById_idx" ON "Task"("approvedById");

-- CreateIndex
CREATE INDEX "Task_backupOwnerId_idx" ON "Task"("backupOwnerId");

-- CreateIndex
CREATE INDEX "TaskInstance_ownerId_frequency_idx" ON "TaskInstance"("ownerId", "frequency");

-- CreateIndex
CREATE INDEX "TaskInstance_ownerId_scheduledFor_idx" ON "TaskInstance"("ownerId", "scheduledFor");

-- CreateIndex
CREATE INDEX "TaskInstance_taskId_idx" ON "TaskInstance"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskInstance_taskId_scheduledFor_key" ON "TaskInstance"("taskId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Alert_raisedById_idx" ON "Alert"("raisedById");

-- CreateIndex
CREATE INDEX "Alert_organizationId_idx" ON "Alert"("organizationId");

-- CreateIndex
CREATE INDEX "Alert_taskInstanceId_idx" ON "Alert"("taskInstanceId");

-- CreateIndex
CREATE INDEX "Alert_departmentId_idx" ON "Alert"("departmentId");

-- CreateIndex
CREATE INDEX "Alert_againstUserId_idx" ON "Alert"("againstUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DwmsPermissionConfig_organizationId_key" ON "DwmsPermissionConfig"("organizationId");

-- AddForeignKey
-- Notification_employeeId_fkey and Suggestion_hodId_fkey may already exist
-- (see 20260702_add_notification_table and
-- 20260702_reconcile_suggestion_hod_review_and_employee_notifications).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Notification_employeeId_fkey' AND cl.relname = 'Notification'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Suggestion_hodId_fkey' AND cl.relname = 'Suggestion'
  ) THEN
    ALTER TABLE "Suggestion"
      ADD CONSTRAINT "Suggestion_hodId_fkey"
      FOREIGN KEY ("hodId") REFERENCES "Employee"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_handoverEmployee2Id_fkey" FOREIGN KEY ("handoverEmployee2Id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- may already exist under this name on environments where a later-dated
-- migration renamed it before this one ran (see DropForeignKey note above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'LeaveSettings_organizationId_fkey' AND cl.relname = 'LeaveSettings'
  ) THEN
    ALTER TABLE "LeaveSettings" ADD CONSTRAINT "LeaveSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_backupOwnerId_fkey" FOREIGN KEY ("backupOwnerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskInstance" ADD CONSTRAINT "TaskInstance_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_taskInstanceId_fkey" FOREIGN KEY ("taskInstanceId") REFERENCES "TaskInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_againstUserId_fkey" FOREIGN KEY ("againstUserId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DwmsPermissionConfig" ADD CONSTRAINT "DwmsPermissionConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
-- may already be renamed on environments where a later-dated migration
-- touched this index before this one ran.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'LeaveSettings_orgId_key')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'LeaveSettings_organizationId_key') THEN
    ALTER INDEX "LeaveSettings_orgId_key" RENAME TO "LeaveSettings_organizationId_key";
  END IF;
END $$;

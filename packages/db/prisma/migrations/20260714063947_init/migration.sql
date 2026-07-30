/*
  Warnings:

  - You are about to drop the column `reviewerCommitteeId` on the `SuggestionReview` table. All the data in the column will be lost.
  - Made the column `name` on table `Role` required. This step will fail if there are existing NULL values in that column.
  - Made the column `roleId` on table `RolePermission` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
-- staging's history includes hand-applied/partially-resolved migrations
-- (see docs/deployment.md "Known drift"), so don't assume this exists.
ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_handoverEmployee2Id_fkey";

-- DropForeignKey
-- may already be renamed to LeaveSettings_organizationId_fkey by
-- 20260701212649_add_dwms_module (out-of-order branch merge).
ALTER TABLE "LeaveSettings" DROP CONSTRAINT IF EXISTS "LeaveSettings_orgId_fkey";

-- DropForeignKey
-- may already be dropped by 20260701212649_add_dwms_module.
ALTER TABLE "SuggestionReview" DROP CONSTRAINT IF EXISTS "SuggestionReview_reviewerCommitteeId_fkey";

-- DropIndex
-- may already be dropped by 20260701212649_add_dwms_module.
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
ALTER TABLE "Role" ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
-- RolePermission_pkey may already have been added by
-- 20260701212649_add_dwms_module.
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
-- may already be dropped by 20260701212649_add_dwms_module.
ALTER TABLE "SuggestionReview" DROP COLUMN IF EXISTS "reviewerCommitteeId";

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'LeaveRequest_handoverEmployee2Id_fkey' AND cl.relname = 'LeaveRequest'
  ) THEN
    ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_handoverEmployee2Id_fkey" FOREIGN KEY ("handoverEmployee2Id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
-- may already exist under this name via 20260701212649_add_dwms_module.
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

-- RenameIndex
-- may already be renamed by 20260701212649_add_dwms_module.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'LeaveSettings_orgId_key')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'LeaveSettings_organizationId_key') THEN
    ALTER INDEX "LeaveSettings_orgId_key" RENAME TO "LeaveSettings_organizationId_key";
  END IF;
END $$;

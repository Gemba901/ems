/*
  Warnings:

  - You are about to drop the column `reviewerCommitteeId` on the `SuggestionReview` table. All the data in the column will be lost.
  - Made the column `name` on table `Role` required. This step will fail if there are existing NULL values in that column.
  - Made the column `roleId` on table `RolePermission` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_handoverEmployee2Id_fkey";

-- DropForeignKey
ALTER TABLE "LeaveSettings" DROP CONSTRAINT "LeaveSettings_orgId_fkey";

-- DropForeignKey
ALTER TABLE "SuggestionReview" DROP CONSTRAINT "SuggestionReview_reviewerCommitteeId_fkey";

-- DropIndex
DROP INDEX "ConsultancyVisit_clientOrgId_date_idx";

-- DropIndex
DROP INDEX "ConsultancyVisit_date_idx";

-- DropIndex
DROP INDEX "LeaveRequest_handoverEmployeeId_idx";

-- DropIndex
DROP INDEX "VisitRequest_organizationId_idx";

-- DropIndex
DROP INDEX "quotes_active_idx";

-- DropIndex
DROP INDEX "quotes_timeOfDay_idx";

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
ALTER TABLE "RolePermission" ALTER COLUMN "roleId" SET NOT NULL,
ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId");

-- AlterTable
ALTER TABLE "SuggestionReview" DROP COLUMN "reviewerCommitteeId";

-- AlterTable
ALTER TABLE "quotes" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_handoverEmployee2Id_fkey" FOREIGN KEY ("handoverEmployee2Id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveSettings" ADD CONSTRAINT "LeaveSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LeaveSettings_orgId_key" RENAME TO "LeaveSettings_organizationId_key";

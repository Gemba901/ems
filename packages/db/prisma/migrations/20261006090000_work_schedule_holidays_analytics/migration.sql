-- Team Workspace: organization work schedule and holidays, schedule snapshot on attendance,
-- task/project completion dates for on-time reporting, and concurrent sprints with a lead and sub-team.

-- CreateEnum
CREATE TYPE "WorkProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkHolidaySource" AS ENUM ('PUBLIC', 'COMPANY');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "lateGraceMinutes" INTEGER,
ADD COLUMN     "scheduledBreakMinutes" INTEGER,
ADD COLUMN     "scheduledEndAt" TIMESTAMP(3),
ADD COLUMN     "scheduledStartAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkProject" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "status" "WorkProjectStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "targetDate" DATE;

-- AlterTable
ALTER TABLE "WorkSprint" ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "WorkTask" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkSprintMember" (
    "sprintId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "WorkSprintMember_pkey" PRIMARY KEY ("sprintId","employeeId")
);

-- CreateTable
CREATE TABLE "WorkSettings" (
    "organizationId" TEXT NOT NULL,
    "workStartTime" TEXT NOT NULL DEFAULT '09:00',
    "workEndTime" TEXT NOT NULL DEFAULT '17:00',
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "lunchBreakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lunchStartTime" TEXT,
    "lunchEndTime" TEXT,
    "holidayCountry" TEXT,
    "observeOnNextWorkingDay" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "WorkHoliday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "source" "WorkHolidaySource" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSprintMember_employeeId_idx" ON "WorkSprintMember"("employeeId");

-- CreateIndex
CREATE INDEX "WorkHoliday_organizationId_date_idx" ON "WorkHoliday"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkHoliday_organizationId_date_source_key" ON "WorkHoliday"("organizationId", "date", "source");

-- CreateIndex
CREATE INDEX "WorkTask_assigneeId_completedAt_idx" ON "WorkTask"("assigneeId", "completedAt");

-- AddForeignKey
ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSprintMember" ADD CONSTRAINT "WorkSprintMember_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "WorkSprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSprintMember" ADD CONSTRAINT "WorkSprintMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSettings" ADD CONSTRAINT "WorkSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHoliday" ADD CONSTRAINT "WorkHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Rules Prisma cannot express ────────────────────────────────────────────────

-- Several sprints may now be ACTIVE in one project at the same time.
DROP INDEX "WorkSprint_one_active_per_project";

-- Best available completion time for tasks finished before completedAt existed.
UPDATE "WorkTask" SET "completedAt" = "updatedAt" WHERE "status" = 'DONE';

ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_completedAt_matches_status"
  CHECK (("status" = 'DONE') = ("completedAt" IS NOT NULL));
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_completedAt_matches_status"
  CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

ALTER TABLE "WorkSettings" ADD CONSTRAINT "WorkSettings_times_valid" CHECK (
  "workStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "workEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "workStartTime" < "workEndTime"
);
ALTER TABLE "WorkSettings" ADD CONSTRAINT "WorkSettings_lunch_valid" CHECK (
  NOT "lunchBreakEnabled" OR (
    "lunchStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "lunchEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "workStartTime" <= "lunchStartTime"
    AND "lunchStartTime" < "lunchEndTime"
    AND "lunchEndTime" <= "workEndTime"
  )
);
ALTER TABLE "WorkSettings" ADD CONSTRAINT "WorkSettings_grace_range" CHECK ("lateGraceMinutes" BETWEEN 0 AND 240);
ALTER TABLE "WorkSettings" ADD CONSTRAINT "WorkSettings_country_format" CHECK ("holidayCountry" IS NULL OR "holidayCountry" ~ '^[A-Z]{2}$');

ALTER TABLE "WorkHoliday" ADD CONSTRAINT "WorkHoliday_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120);

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_schedule_complete" CHECK (
  ("scheduledStartAt" IS NULL AND "scheduledEndAt" IS NULL AND "scheduledBreakMinutes" IS NULL AND "lateGraceMinutes" IS NULL)
  OR ("scheduledStartAt" IS NOT NULL AND "scheduledEndAt" > "scheduledStartAt"
      AND "scheduledBreakMinutes" >= 0 AND "lateGraceMinutes" BETWEEN 0 AND 240)
);

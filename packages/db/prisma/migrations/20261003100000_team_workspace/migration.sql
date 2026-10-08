-- Team Workspace: projects, tasks, simple sprints and daily attendance.
-- Prisma-generated DDL first, then the rules Prisma cannot express.
-- CreateEnum
CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "WorkSprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkProjectRole" AS ENUM ('MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "AttendanceLocationStatus" AS ENUM ('CAPTURED', 'MISSING');

-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'WORK';

-- CreateTable
CREATE TABLE "WorkProject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProjectMember" (
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "WorkProjectRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkProjectMember_pkey" PRIMARY KEY ("projectId","employeeId")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" DATE,
    "sprintId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "WorkSprintStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completionSnapshot" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "timezoneAtClockIn" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "locationStatus" "AttendanceLocationStatus" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "locationCapturedAt" TIMESTAMP(3),
    "locationMissingReason" TEXT,
    "clockInRequestId" TEXT NOT NULL,
    "clockOutRequestId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastCorrectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousClockInAt" TIMESTAMP(3) NOT NULL,
    "previousClockOutAt" TIMESTAMP(3),
    "correctedClockInAt" TIMESTAMP(3) NOT NULL,
    "correctedClockOutAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkProject_organizationId_name_idx" ON "WorkProject"("organizationId", "name");

-- CreateIndex
CREATE INDEX "WorkProjectMember_employeeId_idx" ON "WorkProjectMember"("employeeId");

-- CreateIndex
CREATE INDEX "WorkTask_projectId_status_idx" ON "WorkTask"("projectId", "status");

-- CreateIndex
CREATE INDEX "WorkTask_projectId_sprintId_idx" ON "WorkTask"("projectId", "sprintId");

-- CreateIndex
CREATE INDEX "WorkTask_assigneeId_status_dueDate_idx" ON "WorkTask"("assigneeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "WorkTaskComment_taskId_createdAt_idx" ON "WorkTaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkSprint_projectId_status_idx" ON "WorkSprint"("projectId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organizationId_workDate_idx" ON "AttendanceRecord"("organizationId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_employeeId_workDate_idx" ON "AttendanceRecord"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_organizationId_employeeId_workDate_key" ON "AttendanceRecord"("organizationId", "employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_organizationId_employeeId_clockInRequestId_key" ON "AttendanceRecord"("organizationId", "employeeId", "clockInRequestId");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_attendanceRecordId_createdAt_idx" ON "AttendanceCorrection"("attendanceRecordId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProjectMember" ADD CONSTRAINT "WorkProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProjectMember" ADD CONSTRAINT "WorkProjectMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "WorkSprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskComment" ADD CONSTRAINT "WorkTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskComment" ADD CONSTRAINT "WorkTaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "WorkProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Concurrency rules -----------------------------------------------------------

-- Two tabs/devices clocking in at once: only one open record can ever exist.
CREATE UNIQUE INDEX "AttendanceRecord_one_open_per_employee"
  ON "AttendanceRecord"("organizationId", "employeeId") WHERE "clockOutAt" IS NULL;

-- Two managers starting sprints at once: only one ACTIVE sprint per project.
CREATE UNIQUE INDEX "WorkSprint_one_active_per_project"
  ON "WorkSprint"("projectId") WHERE "status" = 'ACTIVE';

-- Attendance integrity --------------------------------------------------------

-- CAPTURED carries real coordinates; MISSING carries a reason and no coordinates.
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_location_shape_check" CHECK (
  ("locationStatus" = 'CAPTURED'
    AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
    AND "accuracyMeters" IS NOT NULL AND "locationCapturedAt" IS NOT NULL
    AND "locationMissingReason" IS NULL)
  OR
  ("locationStatus" = 'MISSING'
    AND "latitude" IS NULL AND "longitude" IS NULL
    AND "accuracyMeters" IS NULL AND "locationCapturedAt" IS NULL
    AND "locationMissingReason" IS NOT NULL
    AND char_length(btrim("locationMissingReason")) BETWEEN 10 AND 500)
);
-- BETWEEN and < 'Infinity' also reject NaN and Infinity.
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_accuracy_check" CHECK ("accuracyMeters" > 0 AND "accuracyMeters" < 'Infinity');
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_clock_order_check" CHECK ("clockOutAt" IS NULL OR "clockOutAt" >= "clockInAt");
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_version_check" CHECK ("version" >= 1);

ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_clock_order_check" CHECK ("correctedClockOutAt" IS NULL OR "correctedClockOutAt" >= "correctedClockInAt");
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500);

-- Sprint lifecycle ------------------------------------------------------------

ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_date_order_check" CHECK ("endDate" >= "startDate");
ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_lifecycle_check" CHECK (
  ("status" = 'PLANNED' AND "startedAt" IS NULL AND "completedAt" IS NULL AND "completionSnapshot" IS NULL)
  OR ("status" = 'ACTIVE' AND "startedAt" IS NOT NULL AND "completedAt" IS NULL AND "completionSnapshot" IS NULL)
  OR ("status" = 'COMPLETED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "completionSnapshot" IS NOT NULL)
);

-- Text limits (DTOs validate first; these are the backstop) -------------------

ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120);
ALTER TABLE "WorkProject" ADD CONSTRAINT "WorkProject_description_check" CHECK (char_length("description") <= 2000);
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200);
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_description_check" CHECK (char_length("description") <= 10000);
ALTER TABLE "WorkTaskComment" ADD CONSTRAINT "WorkTaskComment_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 5000);
ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120);
ALTER TABLE "WorkSprint" ADD CONSTRAINT "WorkSprint_goal_check" CHECK (char_length("goal") <= 500);

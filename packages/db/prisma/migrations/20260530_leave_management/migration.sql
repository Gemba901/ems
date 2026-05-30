-- Add LEAVE to ModuleType enum
ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'LEAVE';

-- Leave enums
DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'STUDY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- LeaveRequest table
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "employeeId"     TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           "LeaveType" NOT NULL,
  "status"         "LeaveStatus" NOT NULL DEFAULT 'PENDING',
  "startDate"      TIMESTAMP(3) NOT NULL,
  "endDate"        TIMESTAMP(3) NOT NULL,
  "days"           INTEGER NOT NULL,
  "reason"         TEXT,
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "reviewNote"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- LeaveBalance table
CREATE TABLE IF NOT EXISTS "LeaveBalance" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "employeeId" TEXT NOT NULL,
  "year"       INTEGER NOT NULL,
  "type"       "LeaveType" NOT NULL,
  "allocated"  INTEGER NOT NULL DEFAULT 0,
  "used"       INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaveBalance_employeeId_year_type_key" UNIQUE ("employeeId", "year", "type")
);

-- Foreign keys
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "LeaveRequest_employeeId_status_idx"   ON "LeaveRequest"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "LeaveRequest_organizationId_startDate_idx" ON "LeaveRequest"("organizationId", "startDate");
CREATE INDEX IF NOT EXISTS "LeaveBalance_employeeId_year_idx" ON "LeaveBalance"("employeeId", "year");

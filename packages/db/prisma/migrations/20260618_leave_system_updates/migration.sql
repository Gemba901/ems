-- Add new leave type enum values
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'SICK_EMERGENCY';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'PRE_ADOPTIVE';

-- Second cover person on LeaveRequest
ALTER TABLE "LeaveRequest"
  ADD COLUMN IF NOT EXISTS "handoverEmployee2Id" TEXT,
  ADD COLUMN IF NOT EXISTS "handoverNotes2"      TEXT;

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_handoverEmployee2Id_fkey"
  FOREIGN KEY ("handoverEmployee2Id") REFERENCES "Employee"("id") ON DELETE SET NULL
  NOT VALID;

ALTER TABLE "LeaveRequest"
  VALIDATE CONSTRAINT "LeaveRequest_handoverEmployee2Id_fkey";

-- Department minimum leave headcount
ALTER TABLE "Department"
  ADD COLUMN IF NOT EXISTS "minLeaveHeadcount" INTEGER NOT NULL DEFAULT 1;

-- Organisation-level leave settings
CREATE TABLE IF NOT EXISTS "LeaveSettings" (
  "id"             TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" TEXT        NOT NULL,
  "workingDays"    INTEGER[]   NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  "enabledTypes"   TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveSettings_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "LeaveSettings_orgId_key"       UNIQUE ("organizationId"),
  CONSTRAINT "LeaveSettings_orgId_fkey"      FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id") ON DELETE CASCADE
);

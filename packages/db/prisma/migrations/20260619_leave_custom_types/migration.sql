-- Convert LeaveRequest.type from LeaveType enum to TEXT
ALTER TABLE "LeaveRequest" ADD COLUMN "type_text" TEXT;
UPDATE "LeaveRequest" SET "type_text" = "type"::TEXT;
ALTER TABLE "LeaveRequest" DROP COLUMN "type";
ALTER TABLE "LeaveRequest" RENAME COLUMN "type_text" TO "type";
ALTER TABLE "LeaveRequest" ALTER COLUMN "type" SET NOT NULL;

-- Re-create indexes (dropped with the column)
CREATE INDEX IF NOT EXISTS "LeaveRequest_employeeId_status_idx" ON "LeaveRequest"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "LeaveRequest_organizationId_startDate_idx" ON "LeaveRequest"("organizationId", "startDate");

-- Convert LeaveBalance.type from LeaveType enum to TEXT
-- Prisma creates @@unique as an index (not a named constraint), so use DROP INDEX
DROP INDEX IF EXISTS "LeaveBalance_employeeId_year_type_key";
ALTER TABLE "LeaveBalance" ADD COLUMN "type_text" TEXT;
UPDATE "LeaveBalance" SET "type_text" = "type"::TEXT;
ALTER TABLE "LeaveBalance" DROP COLUMN "type";
ALTER TABLE "LeaveBalance" RENAME COLUMN "type_text" TO "type";
ALTER TABLE "LeaveBalance" ALTER COLUMN "type" SET NOT NULL;
CREATE UNIQUE INDEX "LeaveBalance_employeeId_year_type_key" ON "LeaveBalance"("employeeId", "year", "type");
CREATE INDEX IF NOT EXISTS "LeaveBalance_employeeId_year_idx" ON "LeaveBalance"("employeeId", "year");

-- Convert LeavePolicy.type from LeaveType enum to TEXT
DROP INDEX IF EXISTS "LeavePolicy_organizationId_year_type_key";
ALTER TABLE "LeavePolicy" ADD COLUMN "type_text" TEXT;
UPDATE "LeavePolicy" SET "type_text" = "type"::TEXT;
ALTER TABLE "LeavePolicy" DROP COLUMN "type";
ALTER TABLE "LeavePolicy" RENAME COLUMN "type_text" TO "type";
ALTER TABLE "LeavePolicy" ALTER COLUMN "type" SET NOT NULL;
CREATE UNIQUE INDEX "LeavePolicy_organizationId_year_type_key" ON "LeavePolicy"("organizationId", "year", "type");
CREATE INDEX IF NOT EXISTS "LeavePolicy_organizationId_year_idx" ON "LeavePolicy"("organizationId", "year");

-- Add customLeaveTypes JSON column to LeaveSettings
ALTER TABLE "LeaveSettings" ADD COLUMN IF NOT EXISTS "customLeaveTypes" JSONB NOT NULL DEFAULT '[]';

-- Drop the now-unused enum
DROP TYPE IF EXISTS "LeaveType";

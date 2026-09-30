CREATE TYPE "ActivityScope" AS ENUM ('ORGANISATION', 'DEPARTMENT', 'JOB_TITLE', 'EMPLOYEE');

ALTER TABLE "Activity"
ADD COLUMN "scope" "ActivityScope",
ADD COLUMN "scopeDepartmentId" TEXT,
ADD COLUMN "scopeJobTitle" TEXT,
ADD COLUMN "scopeJobTitleLabel" TEXT,
ADD COLUMN "scopeEmployeeId" TEXT;

ALTER TABLE "ActivityIngestionRow"
ADD COLUMN "scope" "ActivityScope",
ADD COLUMN "scopeTarget" TEXT,
ADD COLUMN "assignedCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Task"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Activity_organizationId_scope_idx" ON "Activity"("organizationId", "scope");
CREATE INDEX "Activity_scopeDepartmentId_idx" ON "Activity"("scopeDepartmentId");
CREATE INDEX "Activity_scopeEmployeeId_idx" ON "Activity"("scopeEmployeeId");
CREATE INDEX "Activity_organizationId_scopeJobTitle_idx" ON "Activity"("organizationId", "scopeJobTitle");

ALTER TABLE "Activity"
ADD CONSTRAINT "Activity_scopeDepartmentId_fkey"
FOREIGN KEY ("scopeDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Activity"
ADD CONSTRAINT "Activity_scopeEmployeeId_fkey"
FOREIGN KEY ("scopeEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Map activity definitions to job titles and employee-level activation state.
CREATE TYPE "EmployeeActivityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "JobTitleActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTitleActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeActivityAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "status" "EmployeeActivityStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeActivityAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobTitleActivity_organizationId_jobTitle_activityId_key" ON "JobTitleActivity"("organizationId", "jobTitle", "activityId");
CREATE INDEX "JobTitleActivity_organizationId_jobTitle_idx" ON "JobTitleActivity"("organizationId", "jobTitle");
CREATE INDEX "JobTitleActivity_activityId_idx" ON "JobTitleActivity"("activityId");

CREATE UNIQUE INDEX "EmployeeActivityAssignment_employeeId_activityId_key" ON "EmployeeActivityAssignment"("employeeId", "activityId");
CREATE INDEX "EmployeeActivityAssignment_organizationId_status_idx" ON "EmployeeActivityAssignment"("organizationId", "status");
CREATE INDEX "EmployeeActivityAssignment_employeeId_status_idx" ON "EmployeeActivityAssignment"("employeeId", "status");
CREATE INDEX "EmployeeActivityAssignment_activityId_idx" ON "EmployeeActivityAssignment"("activityId");

ALTER TABLE "JobTitleActivity" ADD CONSTRAINT "JobTitleActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobTitleActivity" ADD CONSTRAINT "JobTitleActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmployeeActivityAssignment" ADD CONSTRAINT "EmployeeActivityAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeActivityAssignment" ADD CONSTRAINT "EmployeeActivityAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeActivityAssignment" ADD CONSTRAINT "EmployeeActivityAssignment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "JobTitleActivity" ("id", "organizationId", "jobTitle", "activityId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "organizationId", lower(btrim("primaryResponsibleDesignation")), "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Activity"
WHERE "primaryResponsibleDesignation" IS NOT NULL
  AND btrim("primaryResponsibleDesignation") <> ''
ON CONFLICT ("organizationId", "jobTitle", "activityId") DO NOTHING;

INSERT INTO "EmployeeActivityAssignment" ("id", "organizationId", "employeeId", "activityId", "status", "activatedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."organizationId", t."ownerId", t."activityId", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Task" t
JOIN "Employee" e ON e."id" = t."ownerId"
WHERE t."activityId" IS NOT NULL
  AND t."frequency" <> 'PLANNED'
ON CONFLICT ("employeeId", "activityId") DO NOTHING;

-- Existing employment statuses are unchanged. History begins with confirmed EMS changes.
ALTER TABLE "Employee" ADD COLUMN "employmentStatusRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "EmsEmploymentStatusChange" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT,
  "subjectEmployeeId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fromStatus" "EmploymentStatus" NOT NULL,
  "toStatus" "EmploymentStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorName" TEXT,
  "source" TEXT NOT NULL DEFAULT 'EMS_MANUAL',
  "revision" INTEGER NOT NULL,
  "expectedUpdatedAt" TIMESTAMP(3) NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "previousDepartmentId" TEXT,
  "previousJobTitle" TEXT,
  "activitySync" TEXT NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "EmsEmploymentStatusChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmsEmploymentStatusChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmsEmploymentStatusChange_distinct_status" CHECK ("fromStatus" <> "toStatus"),
  CONSTRAINT "EmsEmploymentStatusChange_reason" CHECK (length(btrim("reason")) BETWEEN 3 AND 500),
  CONSTRAINT "EmsEmploymentStatusChange_revision" CHECK ("revision" > 0),
  CONSTRAINT "EmsEmploymentStatusChange_activitySync" CHECK ("activitySync" IN ('PENDING','SYNCED','FAILED','UNAVAILABLE'))
);
CREATE UNIQUE INDEX "EmsEmploymentStatusChange_organizationId_requestId_key" ON "EmsEmploymentStatusChange"("organizationId", "requestId");
CREATE INDEX "EmsEmploymentStatusChange_organizationId_employeeId_changedAt_idx" ON "EmsEmploymentStatusChange"("organizationId", "employeeId", "changedAt");

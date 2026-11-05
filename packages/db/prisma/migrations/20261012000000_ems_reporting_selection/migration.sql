ALTER TABLE "EmsOnboardingRecord"
  ADD COLUMN "reportingToRecordId" TEXT,
  ADD COLUMN "reportingToEmployeeId" TEXT,
  ADD COLUMN "reportingToBoard" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "EmsOnboardingRecord_reportingToRecordId_idx" ON "EmsOnboardingRecord"("reportingToRecordId");
CREATE INDEX "EmsOnboardingRecord_reportingToEmployeeId_idx" ON "EmsOnboardingRecord"("reportingToEmployeeId");
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reportingToRecordId_fkey"
 FOREIGN KEY ("reportingToRecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reportingToEmployeeId_fkey"
 FOREIGN KEY ("reportingToEmployeeId") REFERENCES "Employee"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_one_reporting_target"
 CHECK ((CASE WHEN "reportingToRecordId" IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "reportingToEmployeeId" IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "reportingToBoard" THEN 1 ELSE 0 END) <= 1);

-- Existing employees remain UNKNOWN unless a manager is already assigned. No historical Board assumption.
ALTER TABLE "Employee" ADD COLUMN "reportsToBoard" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pendingReportingRecordId" TEXT;
CREATE INDEX "Employee_pendingReportingRecordId_idx" ON "Employee"("pendingReportingRecordId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pendingReportingRecordId_fkey"
 FOREIGN KEY ("pendingReportingRecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_one_reporting_target"
 CHECK ((CASE WHEN "reportingManagerId" IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "pendingReportingRecordId" IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN "reportsToBoard" THEN 1 ELSE 0 END) <= 1);

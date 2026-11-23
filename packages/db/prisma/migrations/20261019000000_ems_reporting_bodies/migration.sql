BEGIN;
-- Preserve existing Board flags and manager assignments. No inferred backfill.
ALTER TABLE "EmsOnboardingRecord" ADD COLUMN "reportingToBody" TEXT;
ALTER TABLE "Employee" ADD COLUMN "reportingBody" TEXT;
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reporting_body_value"
 CHECK ("reportingToBody" IS NULL OR "reportingToBody" IN ('BOARD', 'COMMITTEE', 'MANAGEMENT_COMMITTEE', 'OWNER'));
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_reporting_body_value"
 CHECK ("reportingBody" IS NULL OR "reportingBody" IN ('BOARD', 'COMMITTEE', 'MANAGEMENT_COMMITTEE', 'OWNER'));
ALTER TABLE "EmsOnboardingRecord" DROP CONSTRAINT "EmsOnboardingRecord_one_reporting_target";
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_one_reporting_target"
 CHECK (num_nonnulls("reportingToRecordId", "reportingToEmployeeId", "reportingToBody") + (CASE WHEN "reportingToBoard" THEN 1 ELSE 0 END) <= 1);
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_one_reporting_target";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_one_reporting_target"
 CHECK (num_nonnulls("reportingManagerId", "pendingReportingRecordId", "reportingBody") + (CASE WHEN "reportsToBoard" THEN 1 ELSE 0 END) <= 1);
COMMIT;

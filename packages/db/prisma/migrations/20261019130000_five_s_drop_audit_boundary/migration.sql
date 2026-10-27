-- 5S areas now come from employee profiles (Employee.section); the audit boundary is no longer recorded.
ALTER TABLE "FiveSArea" DROP COLUMN "auditBoundary";
ALTER TABLE "FiveSAudit" DROP COLUMN "auditBoundary";

-- An employee may clock in and out several times a day; each session is its own record.
-- "AttendanceRecord_one_open_per_employee" still allows only one open session at a time.
DROP INDEX "AttendanceRecord_organizationId_employeeId_workDate_key";

CREATE INDEX "AttendanceRecord_organizationId_employeeId_workDate_idx" ON "AttendanceRecord"("organizationId", "employeeId", "workDate");

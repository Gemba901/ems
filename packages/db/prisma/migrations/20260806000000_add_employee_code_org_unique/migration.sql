-- Employee codes must be unique within an organization, matching the existing
-- org-scoped uniqueness for email and phone.
CREATE UNIQUE INDEX "Employee_employeeCode_organizationId_key" ON "Employee"("employeeCode", "organizationId") WHERE "employeeCode" IS NOT NULL;

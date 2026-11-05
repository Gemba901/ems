-- DropIndex
DROP INDEX "Employee_email_organizationId_key";

-- CreateIndex
CREATE INDEX "Employee_email_organizationId_idx" ON "Employee"("email", "organizationId");

-- Drop global unique constraints on Employee email and phone
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_email_key";
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_phone_key";

-- Add org-scoped unique constraints (email+org and phone+org must be unique)
CREATE UNIQUE INDEX "Employee_email_organizationId_key" ON "Employee"("email", "organizationId");
CREATE UNIQUE INDEX "Employee_phone_organizationId_key" ON "Employee"("phone", "organizationId") WHERE "phone" IS NOT NULL;

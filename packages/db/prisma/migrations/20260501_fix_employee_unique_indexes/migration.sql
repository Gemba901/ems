-- Drop the old global unique indexes (were created with CREATE UNIQUE INDEX, not as constraints)
DROP INDEX IF EXISTS "Employee_email_key";
DROP INDEX IF EXISTS "Employee_phone_key";

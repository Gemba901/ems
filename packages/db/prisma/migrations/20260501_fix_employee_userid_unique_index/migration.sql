-- Drop the old global unique index on Employee.userId (was CREATE UNIQUE INDEX, not a constraint)
DROP INDEX IF EXISTS "Employee_userId_key";

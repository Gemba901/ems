-- AlterEnum
ALTER TYPE "RoleName" ADD VALUE 'HR';

-- AlterTable: add primaryColor to Organization
ALTER TABLE "Organization" ADD COLUMN "primaryColor" TEXT DEFAULT '#4F46E5';

-- AlterTable: add avatarUrl to Employee
ALTER TABLE "Employee" ADD COLUMN "avatarUrl" TEXT;

-- Seed HR role (id = 6, between HOD=4 and EMPLOYEE=5 -> use 6)
INSERT INTO "Role" ("id", "name") VALUES (6, 'HR') ON CONFLICT ("id") DO NOTHING;

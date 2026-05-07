-- AlterEnum
ALTER TYPE "RoleName" ADD VALUE 'HR';

-- AlterTable: add primaryColor to Organization
ALTER TABLE "Organization" ADD COLUMN "primaryColor" TEXT DEFAULT '#4F46E5';

-- AlterTable: add avatarUrl to Employee
ALTER TABLE "Employee" ADD COLUMN "avatarUrl" TEXT;

-- CreateEnum
CREATE TYPE "ModuleType" AS ENUM ('SIMS');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "modules" "ModuleType"[] NOT NULL DEFAULT ARRAY[]::"ModuleType"[];

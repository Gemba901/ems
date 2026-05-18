-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'RESIGNED', 'TERMINATED', 'RETIRED', 'SUSPENDED', 'ABSCONDED', 'CONTRACT_ENDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4');

-- AlterTable: add EMS fields to Employee
ALTER TABLE "Employee"
  ADD COLUMN "employeeCode"                TEXT,
  ADD COLUMN "gender"                      "Gender",
  ADD COLUMN "dateOfBirth"                 TIMESTAMP(3),
  ADD COLUMN "nationalId"                  TEXT,
  ADD COLUMN "employmentStatus"            "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "jobTitle"                    TEXT,
  ADD COLUMN "dateJoined"                  TIMESTAMP(3),
  ADD COLUMN "workStation"                 TEXT,
  ADD COLUMN "jobDescription"              TEXT,
  ADD COLUMN "homeAddress"                 TEXT,
  ADD COLUMN "emergencyContactName"        TEXT,
  ADD COLUMN "emergencyContactPhone"       TEXT,
  ADD COLUMN "emergencyContactRelationship" TEXT,
  ADD COLUMN "skillLevel"                  "SkillLevel",
  ADD COLUMN "trainingNeeded"              BOOLEAN;

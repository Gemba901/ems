-- CreateEnum: EmploymentType
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CASUAL');

-- AlterTable: Employee — add all new EMS columns
ALTER TABLE "Employee"
  ADD COLUMN "middleName"          TEXT,
  ADD COLUMN "nationality"         TEXT,
  ADD COLUMN "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  ADD COLUMN "section"             TEXT,
  ADD COLUMN "subSection"          TEXT,
  ADD COLUMN "shift"               TEXT,
  ADD COLUMN "reportingManagerId"  TEXT,
  ADD COLUMN "hrRecordOwnerId"     TEXT,
  ADD COLUMN "employmentType"      "EmploymentType",
  ADD COLUMN "level"               TEXT,
  ADD COLUMN "grade"               TEXT,
  ADD COLUMN "jobCategory"         TEXT,
  ADD COLUMN "primaryWorkRole"     TEXT,
  ADD COLUMN "machineProcess"      TEXT,
  ADD COLUMN "canBeAssignedTasks"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canBeMember"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canBeLeader"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappNumber"      TEXT;

-- AddForeignKey: Employee.reportingManagerId -> Employee.id
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_reportingManagerId_fkey"
  FOREIGN KEY ("reportingManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Employee.hrRecordOwnerId -> Employee.id
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_hrRecordOwnerId_fkey"
  FOREIGN KEY ("hrRecordOwnerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: SteeringCommitteeMember — add roleInCommittee
ALTER TABLE "SteeringCommitteeMember"
  ADD COLUMN "roleInCommittee" TEXT;

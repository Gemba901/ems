-- Additive only: existing text and reliever links remain intact. No automatic HOD inference.
ALTER TABLE "Employee" ADD COLUMN "pendingFirstRelieverRecordId" TEXT, ADD COLUMN "pendingSecondRelieverRecordId" TEXT;
ALTER TABLE "EmsOnboardingRecord" ADD COLUMN "hodReviewKey" TEXT,
  ADD COLUMN "reliever1RecordId" TEXT, ADD COLUMN "reliever1EmployeeId" TEXT,
  ADD COLUMN "reliever2RecordId" TEXT, ADD COLUMN "reliever2EmployeeId" TEXT;
CREATE INDEX "Employee_pendingFirstRelieverRecordId_idx" ON "Employee"("pendingFirstRelieverRecordId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pendingFirstRelieverRecordId_fkey" FOREIGN KEY ("pendingFirstRelieverRecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "Employee_pendingSecondRelieverRecordId_idx" ON "Employee"("pendingSecondRelieverRecordId");
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pendingSecondRelieverRecordId_fkey" FOREIGN KEY ("pendingSecondRelieverRecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "EmsOnboardingRecord_reliever1RecordId_idx" ON "EmsOnboardingRecord"("reliever1RecordId");
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reliever1RecordId_fkey" FOREIGN KEY ("reliever1RecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "EmsOnboardingRecord_reliever1EmployeeId_idx" ON "EmsOnboardingRecord"("reliever1EmployeeId");
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reliever1EmployeeId_fkey" FOREIGN KEY ("reliever1EmployeeId") REFERENCES "Employee"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reliever1_one_target" CHECK ("reliever1RecordId" IS NULL OR "reliever1EmployeeId" IS NULL);
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_first_reliever_one_target" CHECK ("firstRelieverId" IS NULL OR "pendingFirstRelieverRecordId" IS NULL);
CREATE INDEX "EmsOnboardingRecord_reliever2RecordId_idx" ON "EmsOnboardingRecord"("reliever2RecordId");
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reliever2RecordId_fkey" FOREIGN KEY ("reliever2RecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE INDEX "EmsOnboardingRecord_reliever2EmployeeId_idx" ON "EmsOnboardingRecord"("reliever2EmployeeId");
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reliever2EmployeeId_fkey" FOREIGN KEY ("reliever2EmployeeId") REFERENCES "Employee"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "EmsOnboardingRecord" ADD CONSTRAINT "EmsOnboardingRecord_reliever2_one_target" CHECK ("reliever2RecordId" IS NULL OR "reliever2EmployeeId" IS NULL);
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_second_reliever_one_target" CHECK ("secondRelieverId" IS NULL OR "pendingSecondRelieverRecordId" IS NULL);
CREATE TABLE "EmsDepartmentHod" (
  "id" TEXT NOT NULL, "departmentId" TEXT NOT NULL, "branchKey" TEXT NOT NULL, "branchLabel" TEXT NOT NULL,
  "employeeId" TEXT, "pendingRecordId" TEXT, "isUnassigned" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1, "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmsDepartmentHod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmsDepartmentHod_one_target" CHECK (
    (CASE WHEN "employeeId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "pendingRecordId" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "isUnassigned" THEN 1 ELSE 0 END) <= 1),
  CONSTRAINT "EmsDepartmentHod_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmsDepartmentHod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmsDepartmentHod_pendingRecordId_fkey" FOREIGN KEY ("pendingRecordId") REFERENCES "EmsOnboardingRecord"("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmsDepartmentHod_departmentId_branchKey_key" ON "EmsDepartmentHod"("departmentId", "branchKey");
CREATE INDEX "EmsDepartmentHod_employeeId_idx" ON "EmsDepartmentHod"("employeeId");
CREATE INDEX "EmsDepartmentHod_pendingRecordId_idx" ON "EmsDepartmentHod"("pendingRecordId");

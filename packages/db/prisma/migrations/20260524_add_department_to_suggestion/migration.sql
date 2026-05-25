-- AlterTable: add departmentId to Suggestion
ALTER TABLE "Suggestion" ADD COLUMN "departmentId" TEXT;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill departmentId from the submitting employee's department
UPDATE "Suggestion" s
SET "departmentId" = e."departmentId"
FROM "Employee" e
WHERE s."employeeId" = e.id
  AND e."departmentId" IS NOT NULL;

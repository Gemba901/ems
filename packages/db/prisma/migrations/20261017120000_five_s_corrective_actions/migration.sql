-- Action plans can hold several corrective actions, each with its own owner, due date and completion.
-- Affected locations are no longer kept on actions; existing values are folded into the finding.

-- CreateTable
CREATE TABLE "FiveSCorrectiveAction" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSCorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiveSCorrectiveAction_actionId_sortOrder_idx" ON "FiveSCorrectiveAction"("actionId", "sortOrder");

-- CreateIndex
CREATE INDEX "FiveSCorrectiveAction_ownerId_completedAt_idx" ON "FiveSCorrectiveAction"("ownerId", "completedAt");

-- AddForeignKey
ALTER TABLE "FiveSCorrectiveAction" ADD CONSTRAINT "FiveSCorrectiveAction_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "FiveSAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSCorrectiveAction" ADD CONSTRAINT "FiveSCorrectiveAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSCorrectiveAction" ADD CONSTRAINT "FiveSCorrectiveAction_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSCorrectiveAction" ADD CONSTRAINT "FiveSCorrectiveAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Move each existing single corrective action into the new table. Actions already sent for
-- verification count that step as done when they were submitted.
INSERT INTO "FiveSCorrectiveAction" ("id", "actionId", "sortOrder", "description", "ownerId", "dueDate", "completedAt", "completedById", "createdById", "updatedAt")
SELECT gen_random_uuid()::text, a."id", 1, a."correctiveAction", a."ownerId", a."dueDate",
       CASE WHEN a."status" <> 'OPEN' THEN COALESCE(a."submittedAt", a."updatedAt") END,
       CASE WHEN a."status" <> 'OPEN' THEN a."ownerId" END,
       a."createdById", CURRENT_TIMESTAMP
FROM "FiveSAction" a
WHERE a."correctiveAction" IS NOT NULL AND btrim(a."correctiveAction") <> '';

UPDATE "FiveSAction"
SET "finding" = "finding" || E'\nAffected locations: ' || "affectedLocations"
WHERE "affectedLocations" IS NOT NULL AND btrim("affectedLocations") <> '';

-- AlterTable
ALTER TABLE "FiveSAction" DROP COLUMN "affectedLocations",
DROP COLUMN "correctiveAction";

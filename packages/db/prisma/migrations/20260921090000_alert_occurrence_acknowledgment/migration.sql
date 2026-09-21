-- Destructive DWMS alert-model reset.
-- Existing alerts (including abnormalities) are removed. Alert comments are
-- removed through the AlertComment -> Alert ON DELETE CASCADE constraint.
DELETE FROM "Alert";

ALTER TABLE "Alert"
  DROP COLUMN IF EXISTS "escalatedToEmployeeId",
  DROP COLUMN "status",
  DROP COLUMN "correctiveAction",
  DROP COLUMN "closureNote",
  DROP COLUMN "resolvedAt",
  DROP COLUMN "abnormalitySourceAlertId",
  DROP COLUMN "closureApprovalStatus",
  DROP COLUMN "closureApproverId",
  DROP COLUMN "closureRequestedById",
  DROP COLUMN "closureRequestedAt",
  DROP COLUMN "closureRejectedAt",
  DROP COLUMN "closureRejectionNote",
  DROP COLUMN "recipientEmployeeIds",
  ADD COLUMN "raiseCount" INTEGER NOT NULL DEFAULT 1;

DROP TYPE "AlertStatus";
DROP TYPE "AlertClosureApprovalStatus";

ALTER TABLE "DwmsPermissionConfig"
  DROP COLUMN "escalateUnacknowledgedMediumMins",
  DROP COLUMN "escalateUnacknowledgedHighMins",
  DROP COLUMN "escalateUnacknowledgedCriticalMins",
  DROP COLUMN "escalateUnacknowledgedMins",
  DROP COLUMN "abnormalityMediumMins",
  DROP COLUMN "abnormalityHighMins",
  DROP COLUMN "abnormalityCriticalMins",
  DROP COLUMN "escalationContactRules",
  DROP COLUMN "customEscalationContactIds";

DROP TYPE "EscalationContactRule";

ALTER TABLE "Task" DROP COLUMN "overdueAlertTo", DROP COLUMN "overdueAlertToEmployeeIds";
DROP TYPE "OverdueAlertTo";

CREATE TABLE "AlertOccurrence" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "raisedById" TEXT NOT NULL,
  "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedById" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgmentNote" TEXT,
  CONSTRAINT "AlertOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertOccurrence_alertId_raisedAt_idx" ON "AlertOccurrence"("alertId", "raisedAt");
CREATE INDEX "AlertOccurrence_acknowledgedById_idx" ON "AlertOccurrence"("acknowledgedById");

ALTER TABLE "AlertOccurrence" ADD CONSTRAINT "AlertOccurrence_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertOccurrence" ADD CONSTRAINT "AlertOccurrence_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertOccurrence" ADD CONSTRAINT "AlertOccurrence_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compatibility guard for staging databases where this original DWMS column
-- was removed outside the checked-in migration history.
ALTER TABLE "DwmsPermissionConfig"
  ADD COLUMN IF NOT EXISTS "alertViewLevel" "ViewLevel" NOT NULL DEFAULT 'OWN';

ALTER TABLE "AttendanceRecord" ADD COLUMN "autoClockedOutAt" TIMESTAMP(3);
-- Only open, scheduled records are scanned by the minute worker.
CREATE INDEX "AttendanceRecord_auto_clock_out_due_idx" ON "AttendanceRecord" ("scheduledEndAt", "id") WHERE "clockOutAt" IS NULL AND "scheduledEndAt" IS NOT NULL;

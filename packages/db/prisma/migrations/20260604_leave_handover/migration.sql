ALTER TABLE "LeaveRequest"
    ADD COLUMN "handoverEmployeeId" TEXT,
    ADD COLUMN "handoverNotes"      TEXT;

ALTER TABLE "LeaveRequest"
    ADD CONSTRAINT "LeaveRequest_handoverEmployeeId_fkey"
    FOREIGN KEY ("handoverEmployeeId") REFERENCES "Employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LeaveRequest_handoverEmployeeId_idx" ON "LeaveRequest"("handoverEmployeeId");

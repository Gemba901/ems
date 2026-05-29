-- Calendar features: completion notes, multi-day, recurrence, attendees

-- completionNote on ConsultancyVisit
ALTER TABLE "ConsultancyVisit" ADD COLUMN "completionNote" TEXT;

-- endDate for multi-day visits
ALTER TABLE "ConsultancyVisit" ADD COLUMN "endDate" TIMESTAMP(3);

-- recurrence fields
CREATE TYPE "RecurrencePattern" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');
ALTER TABLE "ConsultancyVisit" ADD COLUMN "recurrencePattern" "RecurrencePattern";
ALTER TABLE "ConsultancyVisit" ADD COLUMN "recurrenceEndDate" TIMESTAMP(3);
ALTER TABLE "ConsultancyVisit" ADD COLUMN "recurrenceGroupId" TEXT;
CREATE INDEX "ConsultancyVisit_recurrenceGroupId_idx" ON "ConsultancyVisit"("recurrenceGroupId");

-- VisitAttendee join table
CREATE TABLE "VisitAttendee" (
    "id"         TEXT NOT NULL,
    "visitId"    TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role"       TEXT,
    CONSTRAINT "VisitAttendee_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VisitAttendee"
    ADD CONSTRAINT "VisitAttendee_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES "ConsultancyVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VisitAttendee"
    ADD CONSTRAINT "VisitAttendee_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "VisitAttendee_visitId_employeeId_key" ON "VisitAttendee"("visitId", "employeeId");

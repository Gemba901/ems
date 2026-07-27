-- CalendarBlock: allow targeting a single employee (personal "Out of Office"),
-- distinct from an org-wide block (Holiday). employeeId = NULL keeps existing
-- org-wide semantics; employeeId set = the repurposed BUSY_DAY block scoped to
-- that one employee.
ALTER TABLE "CalendarBlock" ADD COLUMN "employeeId" TEXT;

ALTER TABLE "CalendarBlock"
  ADD CONSTRAINT "CalendarBlock_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CalendarEvent: free-text prospect/company name, set only for "New Client Visit"
-- quick-created events (initial meetings with a company not yet onboarded as a
-- Partner Organization).
ALTER TABLE "CalendarEvent" ADD COLUMN "prospectOrgName" TEXT;

-- CalendarFilter: Google Calendar-style user-defined filters for the holistic
-- calendar agenda, scoped per employee.
CREATE TABLE "CalendarFilter" (
  "id"         TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "kinds"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "orgIds"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "colors"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarFilter_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CalendarFilter"
  ADD CONSTRAINT "CalendarFilter_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

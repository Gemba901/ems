-- Holistic Calendar: new enums, CalendarEvent, EventInvitation, EventParticipant

-- CalendarEventType enum
DO $$ BEGIN
  CREATE TYPE "CalendarEventType" AS ENUM (
    'PERSONAL_EVENT',
    'PERSONAL_REMINDER',
    'BIRTHDAY',
    'PERSONAL_TRAINING',
    'COMPANY_TRAINING',
    'COMPANY_EVENT',
    'COMPANY_HOLIDAY',
    'MEETING',
    'AUDIT',
    'TRAINING_SESSION'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- EventRecurrencePattern enum
DO $$ BEGIN
  CREATE TYPE "EventRecurrencePattern" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- InvitationStatus enum
DO $$ BEGIN
  CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CalendarEvent table
CREATE TABLE IF NOT EXISTS "CalendarEvent" (
  "id"                 TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "title"              TEXT        NOT NULL,
  "description"        TEXT,
  "type"               "CalendarEventType" NOT NULL,
  "startAt"            TIMESTAMP(3) NOT NULL,
  "endAt"              TIMESTAMP(3) NOT NULL,
  "allDay"             BOOLEAN     NOT NULL DEFAULT false,
  "organizationId"     TEXT        NOT NULL,
  "createdById"        TEXT        NOT NULL,
  "isRecurring"        BOOLEAN     NOT NULL DEFAULT false,
  "recurrencePattern"  "EventRecurrencePattern",
  "recurrenceEndAt"    TIMESTAMP(3),
  "parentEventId"      TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- EventInvitation table
CREATE TABLE IF NOT EXISTS "EventInvitation" (
  "id"          TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"     TEXT             NOT NULL,
  "inviteeId"   TEXT             NOT NULL,
  "status"      "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventInvitation_eventId_inviteeId_key" UNIQUE ("eventId", "inviteeId")
);

-- EventParticipant table
CREATE TABLE IF NOT EXISTS "EventParticipant" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"    TEXT        NOT NULL,
  "employeeId" TEXT        NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventParticipant_eventId_employeeId_key" UNIQUE ("eventId", "employeeId")
);

-- Foreign keys: CalendarEvent
ALTER TABLE "CalendarEvent"
  ADD CONSTRAINT "CalendarEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarEvent_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CalendarEvent_parentEventId_fkey"
    FOREIGN KEY ("parentEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys: EventInvitation
ALTER TABLE "EventInvitation"
  ADD CONSTRAINT "EventInvitation_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EventInvitation_inviteeId_fkey"
    FOREIGN KEY ("inviteeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: EventParticipant
ALTER TABLE "EventParticipant"
  ADD CONSTRAINT "EventParticipant_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EventParticipant_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "CalendarEvent_organizationId_startAt_idx" ON "CalendarEvent"("organizationId", "startAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_createdById_startAt_idx"    ON "CalendarEvent"("createdById", "startAt");
CREATE INDEX IF NOT EXISTS "EventInvitation_inviteeId_status_idx"      ON "EventInvitation"("inviteeId", "status");

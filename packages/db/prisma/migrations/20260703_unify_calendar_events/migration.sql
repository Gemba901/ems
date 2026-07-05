-- Replace the fixed CalendarEventType catalog with a free color + optional label,
-- plus an explicit visibility flag (PRIVATE vs ORG_WIDE) driving who can see the event.

CREATE TYPE "EventColor" AS ENUM ('TOMATO', 'FLAMINGO', 'TANGERINE', 'BANANA', 'SAGE', 'BASIL', 'PEACOCK', 'BLUEBERRY', 'LAVENDER', 'GRAPE', 'GRAPHITE');
CREATE TYPE "EventVisibility" AS ENUM ('PRIVATE', 'ORG_WIDE');

ALTER TABLE "CalendarEvent" ADD COLUMN "label" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "color" "EventColor" NOT NULL DEFAULT 'PEACOCK';
ALTER TABLE "CalendarEvent" ADD COLUMN "visibility" "EventVisibility" NOT NULL DEFAULT 'PRIVATE';

-- Backfill from the old "type" enum, preserving the old EVENT_TYPE_CONFIG dot colors
-- (services/calendar.service.ts) so existing events keep a similar look.
UPDATE "CalendarEvent" SET
  "visibility" = 'ORG_WIDE',
  "label" = 'Company Training',
  "color" = 'TANGERINE'
WHERE "type" = 'COMPANY_TRAINING';

UPDATE "CalendarEvent" SET
  "visibility" = 'ORG_WIDE',
  "label" = 'Company Event',
  "color" = 'PEACOCK'
WHERE "type" = 'COMPANY_EVENT';

UPDATE "CalendarEvent" SET
  "visibility" = 'ORG_WIDE',
  "label" = 'Holiday',
  "color" = 'TOMATO'
WHERE "type" = 'COMPANY_HOLIDAY';

UPDATE "CalendarEvent" SET
  "visibility" = 'ORG_WIDE',
  "label" = 'Training Session',
  "color" = 'BASIL'
WHERE "type" = 'TRAINING_SESSION';

UPDATE "CalendarEvent" SET
  "visibility" = 'ORG_WIDE',
  "label" = 'Audit',
  "color" = 'GRAPHITE'
WHERE "type" = 'AUDIT';

UPDATE "CalendarEvent" SET
  "visibility" = 'PRIVATE',
  "label" = 'Personal Event',
  "color" = 'LAVENDER'
WHERE "type" = 'PERSONAL_EVENT';

UPDATE "CalendarEvent" SET
  "visibility" = 'PRIVATE',
  "label" = 'Reminder',
  "color" = 'BANANA'
WHERE "type" = 'PERSONAL_REMINDER';

UPDATE "CalendarEvent" SET
  "visibility" = 'PRIVATE',
  "label" = 'Birthday',
  "color" = 'FLAMINGO'
WHERE "type" = 'BIRTHDAY';

UPDATE "CalendarEvent" SET
  "visibility" = 'PRIVATE',
  "label" = 'Personal Training',
  "color" = 'BLUEBERRY'
WHERE "type" = 'PERSONAL_TRAINING';

UPDATE "CalendarEvent" SET
  "visibility" = 'PRIVATE',
  "label" = 'Meeting',
  "color" = 'GRAPE'
WHERE "type" = 'MEETING';

ALTER TABLE "CalendarEvent" DROP COLUMN "type";
DROP TYPE "CalendarEventType";

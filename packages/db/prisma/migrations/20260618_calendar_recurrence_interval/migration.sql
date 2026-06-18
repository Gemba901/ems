-- Add recurrenceInterval to CalendarEvent for custom repeat intervals (e.g. every 2 weeks)
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "recurrenceInterval" INTEGER NOT NULL DEFAULT 1;

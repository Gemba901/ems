-- Structured recurrence is opt-in. Null recurrenceUnit preserves the legacy
-- DAILY/WEEKLY/MONTHLY/QUARTERLY/YEARLY scheduling behavior.
CREATE TYPE "RecurrenceUnit" AS ENUM ('DAY', 'WEEK', 'MONTH');

ALTER TABLE "Task"
  ADD COLUMN "recurrenceUnit" "RecurrenceUnit",
  ADD COLUMN "recurrenceInterval" INTEGER,
  ADD COLUMN "recurrenceWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "recurrenceDayOfMonth" INTEGER,
  ADD COLUMN "recurrenceStartsOn" TIMESTAMP(3);

ALTER TABLE "Activity"
  ADD COLUMN "recurrenceUnit" "RecurrenceUnit",
  ADD COLUMN "recurrenceInterval" INTEGER,
  ADD COLUMN "recurrenceWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "recurrenceDayOfMonth" INTEGER;

ALTER TABLE "Task" ADD CONSTRAINT "Task_structured_recurrence_valid" CHECK (
  "recurrenceUnit" IS NULL OR (
    "recurrenceInterval" BETWEEN 1 AND 99
    AND "recurrenceStartsOn" IS NOT NULL
    AND (
      ("recurrenceUnit" = 'DAY' AND cardinality("recurrenceWeekdays") = 0 AND "recurrenceDayOfMonth" IS NULL)
      OR ("recurrenceUnit" = 'WEEK' AND cardinality("recurrenceWeekdays") BETWEEN 1 AND 7 AND "recurrenceDayOfMonth" IS NULL)
      OR ("recurrenceUnit" = 'MONTH' AND cardinality("recurrenceWeekdays") = 0 AND "recurrenceDayOfMonth" BETWEEN 1 AND 31)
    )
  )
);

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_structured_recurrence_valid" CHECK (
  "recurrenceUnit" IS NULL OR (
    "recurrenceInterval" BETWEEN 1 AND 99
    AND (
      ("recurrenceUnit" = 'DAY' AND cardinality("recurrenceWeekdays") = 0 AND "recurrenceDayOfMonth" IS NULL)
      OR ("recurrenceUnit" = 'WEEK' AND cardinality("recurrenceWeekdays") BETWEEN 1 AND 7 AND "recurrenceDayOfMonth" IS NULL)
      OR ("recurrenceUnit" = 'MONTH' AND cardinality("recurrenceWeekdays") = 0 AND "recurrenceDayOfMonth" BETWEEN 1 AND 31)
    )
  )
);

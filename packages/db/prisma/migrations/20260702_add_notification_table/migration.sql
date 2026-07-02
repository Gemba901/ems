-- The Notification model was added to schema.prisma directly and never had
-- a migration generated for it, so the table has never existed in any
-- database. This creates it (and its enum) to match schema.prisma.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'ACTION_REQUIRED',
      'INFO',
      'REMINDER',
      'ALERT'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"         TEXT             NOT NULL,
  "employeeId" TEXT             NOT NULL,
  "type"       "NotificationType" NOT NULL,
  "module"     TEXT             NOT NULL,
  "title"      TEXT             NOT NULL,
  "message"    TEXT             NOT NULL,
  "isRead"     BOOLEAN          NOT NULL DEFAULT false,
  "actionUrl"  TEXT,
  "metadata"   JSONB,
  "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON c.conrelid = cl.oid
    WHERE c.conname = 'Notification_employeeId_fkey' AND cl.relname = 'Notification'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Notification_employeeId_isRead_idx" ON "Notification"("employeeId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_employeeId_createdAt_idx" ON "Notification"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_employeeId_module_idx" ON "Notification"("employeeId", "module");

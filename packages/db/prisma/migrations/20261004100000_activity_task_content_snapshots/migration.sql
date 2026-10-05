ALTER TABLE "TaskInstance"
ADD COLUMN "titleSnapshot" TEXT,
ADD COLUMN "descriptionSnapshot" TEXT,
ADD COLUMN "requiresDocumentSnapshot" BOOLEAN,
ADD COLUMN "documentNameSnapshot" TEXT;

UPDATE "TaskInstance" AS instance
SET
  "titleSnapshot" = task."title",
  "descriptionSnapshot" = task."description",
  "requiresDocumentSnapshot" = task."requiresCompletionDocument",
  "documentNameSnapshot" = task."completionDocumentName"
FROM "Task" AS task
WHERE instance."taskId" = task."id";

ALTER TABLE "TaskInstance"
ALTER COLUMN "titleSnapshot" SET NOT NULL,
ALTER COLUMN "requiresDocumentSnapshot" SET NOT NULL;

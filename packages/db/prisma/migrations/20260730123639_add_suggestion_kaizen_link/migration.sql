ALTER TABLE "Suggestion" ADD COLUMN "linkedKaizenId" TEXT;

CREATE UNIQUE INDEX "Suggestion_linkedKaizenId_key" ON "Suggestion"("linkedKaizenId");

ALTER TABLE "Suggestion"
  ADD CONSTRAINT "Suggestion_linkedKaizenId_fkey"
  FOREIGN KEY ("linkedKaizenId") REFERENCES "Kaizen"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

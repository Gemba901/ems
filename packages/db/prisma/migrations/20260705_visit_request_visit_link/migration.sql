-- Link an approved VisitRequest to the ConsultancyVisit it gets converted into,
-- so the client's requested visit becomes editable (agenda, status, attendees)
-- the same way a visit the admin scheduled directly is.

ALTER TABLE "VisitRequest" ADD COLUMN "visitId" TEXT;

CREATE UNIQUE INDEX "VisitRequest_visitId_key" ON "VisitRequest"("visitId");

ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "ConsultancyVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

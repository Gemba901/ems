-- Reconciliation migration: the Tickets/TicketUpdate models were added to
-- schema.prisma in 8eed9b8 ("Add Prisma schema/migrations for tickets, SIMS
-- pipeline enums, and nullable employee email"), but that commit's migration
-- files never actually contained the CREATE TABLE statements for them — only
-- the employee-email and SIMS pipeline changes landed. `prisma migrate status`
-- reports "up to date" because every recorded migration did apply cleanly;
-- the ticketing tables were simply never created on any environment.

CREATE TYPE "TicketType" AS ENUM ('SYSTEM_TICKET', 'COMPANY_TICKET');

CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ARCHIVED');

CREATE TABLE "Tickets" (
  "id"             TEXT           NOT NULL,
  "organizationId" TEXT           NOT NULL,
  "raisedById"     TEXT           NOT NULL,
  "type"           "TicketType"   NOT NULL,
  "module"         TEXT           NOT NULL,
  "subject"        TEXT           NOT NULL,
  "message"        TEXT           NOT NULL,
  "department"     TEXT,
  "status"         "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketUpdate" (
  "id"             TEXT           NOT NULL,
  "ticketId"       TEXT           NOT NULL,
  "updatedById"    TEXT           NOT NULL,
  "statusChanged"  "TicketStatus",
  "typeChanged"    "TicketType",
  "note"           TEXT,
  "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TicketUpdate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Tickets"
  ADD CONSTRAINT "Tickets_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tickets"
  ADD CONSTRAINT "Tickets_raisedById_fkey"
  FOREIGN KEY ("raisedById") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketUpdate"
  ADD CONSTRAINT "TicketUpdate_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketUpdate"
  ADD CONSTRAINT "TicketUpdate_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Tickets_organizationId_status_idx" ON "Tickets"("organizationId", "status");

CREATE INDEX "Tickets_raisedById_createdAt_idx" ON "Tickets"("raisedById", "createdAt");

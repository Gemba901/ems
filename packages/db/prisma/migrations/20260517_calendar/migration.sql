-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VisitRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: ConsultancyVisit
CREATE TABLE "ConsultancyVisit" (
    "id"            TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "clientOrgId"   TEXT NOT NULL,
    "date"          TIMESTAMP(3) NOT NULL,
    "startTime"     TEXT,
    "endTime"       TEXT,
    "status"        "VisitStatus" NOT NULL DEFAULT 'TENTATIVE',
    "notes"         TEXT,
    "internalNotes" TEXT,
    "createdById"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultancyVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VisitRequest
CREATE TABLE "VisitRequest" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "requestedDate"   TIMESTAMP(3) NOT NULL,
    "preferredTime"   TEXT,
    "message"         TEXT,
    "status"          "VisitRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responseNote"    TEXT,
    "createdById"     TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ConsultancyVisit" ADD CONSTRAINT "ConsultancyVisit_clientOrgId_fkey"
    FOREIGN KEY ("clientOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultancyVisit" ADD CONSTRAINT "ConsultancyVisit_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index for fast month-range queries
CREATE INDEX "ConsultancyVisit_date_idx" ON "ConsultancyVisit"("date");
CREATE INDEX "ConsultancyVisit_clientOrgId_date_idx" ON "ConsultancyVisit"("clientOrgId", "date");
CREATE INDEX "VisitRequest_organizationId_idx" ON "VisitRequest"("organizationId");

-- Area 05 Monitoring & Control only (05.01 verification, 05.03 alerts). No existing tables are changed.
-- CreateEnum
CREATE TYPE "LexVerificationAction" AS ENUM ('VERIFIED', 'RETURNED');

-- CreateEnum
CREATE TYPE "LexAlertKind" AS ENUM ('MISSING_RESULT', 'VERIFIED_GAP', 'OVERDUE_ACTION');

-- CreateEnum
CREATE TYPE "LexAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'ESCALATED', 'FOLLOW_UP_LINKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LexAlertAction" AS ENUM ('OPENED', 'ACKNOWLEDGED', 'ESCALATED', 'FOLLOW_UP_LINKED', 'CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "LexOfficialResult" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "departmentId" TEXT,
    "submissionId" TEXT NOT NULL,
    "actual" DECIMAL(20,6) NOT NULL,
    "inputA" DECIMAL(20,6),
    "inputB" DECIMAL(20,6),
    "evidence" TEXT,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "verifiedById" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LexOfficialResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexVerificationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "action" "LexVerificationAction" NOT NULL,
    "actual" DECIMAL(20,6),
    "previousActual" DECIMAL(20,6),
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexVerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexMonitoringAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "LexAlertKind" NOT NULL,
    "status" "LexAlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "assignmentId" TEXT,
    "actionId" TEXT,
    "departmentId" TEXT,
    "ownerId" TEXT NOT NULL,
    "escalatedToId" TEXT,
    "linkedActionId" TEXT,
    "comment" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LexMonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexMonitoringAlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" "LexAlertAction" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexMonitoringAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LexOfficialResult_organizationId_departmentId_periodEnd_idx" ON "LexOfficialResult"("organizationId", "departmentId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "LexOfficialResult_organizationId_assignmentId_periodId_key" ON "LexOfficialResult"("organizationId", "assignmentId", "periodId");

-- CreateIndex
CREATE INDEX "LexVerificationEvent_organizationId_assignmentId_periodId_idx" ON "LexVerificationEvent"("organizationId", "assignmentId", "periodId");

-- CreateIndex
CREATE INDEX "LexVerificationEvent_organizationId_createdAt_idx" ON "LexVerificationEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "LexMonitoringAlert_organizationId_status_idx" ON "LexMonitoringAlert"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LexMonitoringAlert_organizationId_ownerId_idx" ON "LexMonitoringAlert"("organizationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "LexMonitoringAlert_organizationId_key_key" ON "LexMonitoringAlert"("organizationId", "key");

-- CreateIndex
CREATE INDEX "LexMonitoringAlertEvent_alertId_createdAt_idx" ON "LexMonitoringAlertEvent"("alertId", "createdAt");

-- CreateIndex
CREATE INDEX "LexMonitoringAlertEvent_organizationId_idx" ON "LexMonitoringAlertEvent"("organizationId");

-- AddForeignKey
ALTER TABLE "LexOfficialResult" ADD CONSTRAINT "LexOfficialResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexVerificationEvent" ADD CONSTRAINT "LexVerificationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexMonitoringAlert" ADD CONSTRAINT "LexMonitoringAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexMonitoringAlertEvent" ADD CONSTRAINT "LexMonitoringAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "LexMonitoringAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;


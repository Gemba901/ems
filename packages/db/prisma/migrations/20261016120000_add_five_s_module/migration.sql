-- 5S Workplace Organisation module (20 Keys, Key 1).
-- CreateEnum
CREATE TYPE "FiveSPractice" AS ENUM ('SORT', 'SET_IN_ORDER', 'SHINE', 'STANDARDIZE', 'SUSTAIN');

-- CreateEnum
CREATE TYPE "FiveSResponsibility" AS ENUM ('ADMIN', 'AUDITOR', 'VERIFIER', 'VIEWER');

-- CreateEnum
CREATE TYPE "FiveSAuditFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "FiveSAuditTemplate" AS ENUM ('PRODUCTION_SHOPFLOOR_V1');

-- CreateEnum
CREATE TYPE "FiveSAuditStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "FiveSActionSource" AS ENUM ('AUDIT', 'MANUAL');

-- CreateEnum
CREATE TYPE "FiveSActionStatus" AS ENUM ('OPEN', 'AWAITING_VERIFICATION', 'VERIFIED');

-- CreateEnum
CREATE TYPE "FiveSActionEventType" AS ENUM ('CREATED', 'ASSIGNED', 'DUE_DATE_CHANGED', 'UPDATED', 'SUBMITTED_FOR_VERIFICATION', 'VERIFIED', 'RETURNED_FOR_REWORK');

-- CreateEnum
CREATE TYPE "FiveSRedTagReason" AS ENUM ('UNNECESSARY', 'OBSOLETE', 'DAMAGED', 'EXCESS', 'UNIDENTIFIED');

-- CreateEnum
CREATE TYPE "FiveSRedTagDecision" AS ENUM ('RETAIN', 'RELOCATE', 'REPAIR', 'RECYCLE', 'DISPOSE');

-- CreateEnum
CREATE TYPE "FiveSRedTagStatus" AS ENUM ('PENDING', 'DECIDED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FiveSStandardStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FiveSRoutineCategory" AS ENUM ('ARRANGEMENT', 'CLEANING', 'INSPECTION', 'RETURN_ITEMS');

-- CreateEnum
CREATE TYPE "FiveSRoutineFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "FiveSRoutineOutcome" AS ENUM ('DONE', 'DONE_WITH_EXCEPTION', 'NOT_DONE');

-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE IF NOT EXISTS 'FIVE_S';

-- CreateTable
CREATE TABLE "FiveSResponsibilityAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "responsibility" "FiveSResponsibility" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiveSResponsibilityAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSCounter" (
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FiveSCounter_pkey" PRIMARY KEY ("organizationId","kind")
);

-- CreateTable
CREATE TABLE "FiveSArea" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "ownerId" TEXT,
    "description" TEXT,
    "auditBoundary" TEXT,
    "auditFrequency" "FiveSAuditFrequency" NOT NULL DEFAULT 'MONTHLY',
    "targetLevelTenths" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "template" "FiveSAuditTemplate" NOT NULL DEFAULT 'PRODUCTION_SHOPFLOOR_V1',
    "status" "FiveSAuditStatus" NOT NULL DEFAULT 'DRAFT',
    "auditDate" DATE NOT NULL,
    "auditorId" TEXT NOT NULL,
    "auditeeId" TEXT,
    "auditeeName" TEXT,
    "auditBoundary" TEXT,
    "remarks" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortPoints" INTEGER,
    "setInOrderPoints" INTEGER,
    "shinePoints" INTEGER,
    "standardizePoints" INTEGER,
    "sustainPoints" INTEGER,
    "totalPoints" INTEGER,
    "levelTenths" INTEGER,
    "targetLevelTenths" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSAuditResponse" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "checkpointNo" INTEGER NOT NULL,
    "locationCount" INTEGER,
    "affectedLocations" TEXT,
    "remark" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSAuditResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "source" "FiveSActionSource" NOT NULL,
    "auditId" TEXT,
    "checkpointNo" INTEGER,
    "practice" "FiveSPractice" NOT NULL,
    "locationCount" INTEGER,
    "checkpointText" TEXT,
    "finding" TEXT NOT NULL,
    "affectedLocations" TEXT,
    "correctiveAction" TEXT,
    "ownerId" TEXT,
    "dueDate" DATE,
    "status" "FiveSActionStatus" NOT NULL DEFAULT 'OPEN',
    "completionDescription" TEXT,
    "completionEvidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationRemarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSActionEvent" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "FiveSActionEventType" NOT NULL,
    "note" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiveSActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSRedTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "quantity" TEXT,
    "reason" "FiveSRedTagReason" NOT NULL,
    "reasonDetails" TEXT,
    "ownerId" TEXT,
    "raisedById" TEXT NOT NULL,
    "raisedOn" DATE NOT NULL,
    "reviewDueDate" DATE,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "FiveSRedTagStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "FiveSRedTagDecision",
    "decisionNotes" TEXT,
    "approvalReference" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resolutionDetails" TEXT,
    "resolvedById" TEXT,
    "resolvedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSRedTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSStandard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "ownerId" TEXT,
    "referenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "FiveSStandardStatus" NOT NULL DEFAULT 'DRAFT',
    "changeNote" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSRoutine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "checkLocation" TEXT NOT NULL,
    "instructions" TEXT,
    "category" "FiveSRoutineCategory" NOT NULL,
    "frequency" "FiveSRoutineFrequency" NOT NULL,
    "responsibleId" TEXT,
    "startDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiveSRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSRoutineCompletion" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "outcome" "FiveSRoutineOutcome" NOT NULL,
    "exception" TEXT,
    "completedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiveSRoutineCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiveSChangeLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiveSChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiveSResponsibilityAssignment_organizationId_responsibility_idx" ON "FiveSResponsibilityAssignment"("organizationId", "responsibility");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSResponsibilityAssignment_employeeId_responsibility_key" ON "FiveSResponsibilityAssignment"("employeeId", "responsibility");

-- CreateIndex
CREATE INDEX "FiveSArea_organizationId_isActive_idx" ON "FiveSArea"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "FiveSArea_departmentId_idx" ON "FiveSArea"("departmentId");

-- CreateIndex
CREATE INDEX "FiveSArea_ownerId_idx" ON "FiveSArea"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSArea_organizationId_name_key" ON "FiveSArea"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FiveSAudit_organizationId_status_auditDate_idx" ON "FiveSAudit"("organizationId", "status", "auditDate");

-- CreateIndex
CREATE INDEX "FiveSAudit_areaId_status_auditDate_idx" ON "FiveSAudit"("areaId", "status", "auditDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSAudit_organizationId_reference_key" ON "FiveSAudit"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSAuditResponse_auditId_checkpointNo_key" ON "FiveSAuditResponse"("auditId", "checkpointNo");

-- CreateIndex
CREATE INDEX "FiveSAction_organizationId_status_idx" ON "FiveSAction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "FiveSAction_areaId_status_idx" ON "FiveSAction"("areaId", "status");

-- CreateIndex
CREATE INDEX "FiveSAction_ownerId_status_idx" ON "FiveSAction"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSAction_organizationId_reference_key" ON "FiveSAction"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSAction_auditId_checkpointNo_key" ON "FiveSAction"("auditId", "checkpointNo");

-- CreateIndex
CREATE INDEX "FiveSActionEvent_actionId_createdAt_idx" ON "FiveSActionEvent"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "FiveSRedTag_organizationId_status_idx" ON "FiveSRedTag"("organizationId", "status");

-- CreateIndex
CREATE INDEX "FiveSRedTag_areaId_status_idx" ON "FiveSRedTag"("areaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSRedTag_organizationId_reference_key" ON "FiveSRedTag"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "FiveSStandard_organizationId_areaId_status_idx" ON "FiveSStandard"("organizationId", "areaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSStandard_seriesId_revision_key" ON "FiveSStandard"("seriesId", "revision");

-- CreateIndex
CREATE INDEX "FiveSRoutine_organizationId_areaId_isActive_idx" ON "FiveSRoutine"("organizationId", "areaId", "isActive");

-- CreateIndex
CREATE INDEX "FiveSRoutine_responsibleId_idx" ON "FiveSRoutine"("responsibleId");

-- CreateIndex
CREATE INDEX "FiveSRoutineCompletion_routineId_scheduledDate_idx" ON "FiveSRoutineCompletion"("routineId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiveSRoutineCompletion_routineId_scheduledDate_key" ON "FiveSRoutineCompletion"("routineId", "scheduledDate");

-- CreateIndex
CREATE INDEX "FiveSChangeLog_organizationId_createdAt_idx" ON "FiveSChangeLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "FiveSChangeLog_entityType_entityId_idx" ON "FiveSChangeLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "FiveSResponsibilityAssignment" ADD CONSTRAINT "FiveSResponsibilityAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSResponsibilityAssignment" ADD CONSTRAINT "FiveSResponsibilityAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSArea" ADD CONSTRAINT "FiveSArea_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSArea" ADD CONSTRAINT "FiveSArea_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSArea" ADD CONSTRAINT "FiveSArea_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAudit" ADD CONSTRAINT "FiveSAudit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAudit" ADD CONSTRAINT "FiveSAudit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FiveSArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAudit" ADD CONSTRAINT "FiveSAudit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAudit" ADD CONSTRAINT "FiveSAudit_auditeeId_fkey" FOREIGN KEY ("auditeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAudit" ADD CONSTRAINT "FiveSAudit_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAuditResponse" ADD CONSTRAINT "FiveSAuditResponse_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "FiveSAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAction" ADD CONSTRAINT "FiveSAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAction" ADD CONSTRAINT "FiveSAction_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FiveSArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAction" ADD CONSTRAINT "FiveSAction_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "FiveSAudit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAction" ADD CONSTRAINT "FiveSAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAction" ADD CONSTRAINT "FiveSAction_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSAction" ADD CONSTRAINT "FiveSAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSActionEvent" ADD CONSTRAINT "FiveSActionEvent_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "FiveSAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSActionEvent" ADD CONSTRAINT "FiveSActionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRedTag" ADD CONSTRAINT "FiveSRedTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRedTag" ADD CONSTRAINT "FiveSRedTag_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FiveSArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRedTag" ADD CONSTRAINT "FiveSRedTag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRedTag" ADD CONSTRAINT "FiveSRedTag_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRedTag" ADD CONSTRAINT "FiveSRedTag_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRedTag" ADD CONSTRAINT "FiveSRedTag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSStandard" ADD CONSTRAINT "FiveSStandard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSStandard" ADD CONSTRAINT "FiveSStandard_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FiveSArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSStandard" ADD CONSTRAINT "FiveSStandard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSStandard" ADD CONSTRAINT "FiveSStandard_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRoutine" ADD CONSTRAINT "FiveSRoutine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRoutine" ADD CONSTRAINT "FiveSRoutine_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FiveSArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRoutine" ADD CONSTRAINT "FiveSRoutine_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRoutineCompletion" ADD CONSTRAINT "FiveSRoutineCompletion_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "FiveSRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSRoutineCompletion" ADD CONSTRAINT "FiveSRoutineCompletion_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSChangeLog" ADD CONSTRAINT "FiveSChangeLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiveSChangeLog" ADD CONSTRAINT "FiveSChangeLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


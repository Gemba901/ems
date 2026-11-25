
-- CreateEnum
CREATE TYPE "LexReviewType" AS ENUM ('DEPARTMENT', 'PERSONAL');

-- CreateEnum
CREATE TYPE "LexReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "LexCoachingKind" AS ENUM ('RECOGNITION', 'FEEDBACK', 'COACHING');

-- CreateEnum
CREATE TYPE "LexEffectivenessStatus" AS ENUM ('EFFECTIVE', 'PARTLY_EFFECTIVE', 'NOT_EFFECTIVE');

-- CreateTable
CREATE TABLE "LexReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "LexReviewType" NOT NULL,
    "status" "LexReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "planDocumentId" TEXT NOT NULL,
    "departmentId" TEXT,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "meetingDate" DATE NOT NULL,
    "achievements" TEXT NOT NULL DEFAULT '',
    "challenges" TEXT NOT NULL DEFAULT '',
    "learning" TEXT NOT NULL DEFAULT '',
    "supportNeeded" TEXT NOT NULL DEFAULT '',
    "reflectionSubmittedAt" TIMESTAMP(3),
    "recognition" TEXT NOT NULL DEFAULT '',
    "findings" TEXT NOT NULL DEFAULT '',
    "decisions" TEXT NOT NULL DEFAULT '',
    "noInputReason" TEXT NOT NULL DEFAULT '',
    "dataLimitReason" TEXT NOT NULL DEFAULT '',
    "nextReviewDate" DATE,
    "snapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "returnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LexReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexReviewVersion" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexReviewVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexReviewAcknowledgement" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "concern" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexReviewAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexCoachingRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "LexCoachingKind" NOT NULL,
    "planDocumentId" TEXT NOT NULL,
    "departmentId" TEXT,
    "subjectId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "topic" TEXT NOT NULL,
    "relatesTo" TEXT NOT NULL DEFAULT 'role',
    "notes" TEXT NOT NULL DEFAULT '',
    "support" TEXT NOT NULL DEFAULT '',
    "response" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LexCoachingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexDevelopmentActionLink" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT,
    "coachingId" TEXT,
    "actionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexDevelopmentActionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexActionEffectiveness" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "status" "LexEffectivenessStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "assessedById" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexActionEffectiveness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexDevelopmentEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "before" JSONB,
    "after" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexDevelopmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LexReview_organizationId_subjectId_idx" ON "LexReview"("organizationId", "subjectId");

-- CreateIndex
CREATE INDEX "LexReview_organizationId_reviewerId_idx" ON "LexReview"("organizationId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "LexReview_organizationId_code_key" ON "LexReview"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LexReview_organizationId_planDocumentId_periodStart_periodE_key" ON "LexReview"("organizationId", "planDocumentId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "LexReviewVersion_reviewId_version_key" ON "LexReviewVersion"("reviewId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LexReviewAcknowledgement_reviewId_version_key" ON "LexReviewAcknowledgement"("reviewId", "version");

-- CreateIndex
CREATE INDEX "LexCoachingRecord_organizationId_subjectId_idx" ON "LexCoachingRecord"("organizationId", "subjectId");

-- CreateIndex
CREATE INDEX "LexCoachingRecord_organizationId_reviewerId_idx" ON "LexCoachingRecord"("organizationId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "LexCoachingRecord_organizationId_code_key" ON "LexCoachingRecord"("organizationId", "code");

-- CreateIndex
CREATE INDEX "LexDevelopmentActionLink_actionId_idx" ON "LexDevelopmentActionLink"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "LexDevelopmentActionLink_reviewId_actionId_key" ON "LexDevelopmentActionLink"("reviewId", "actionId");

-- CreateIndex
CREATE UNIQUE INDEX "LexDevelopmentActionLink_coachingId_actionId_key" ON "LexDevelopmentActionLink"("coachingId", "actionId");

-- CreateIndex
CREATE UNIQUE INDEX "LexActionEffectiveness_organizationId_actionId_key" ON "LexActionEffectiveness"("organizationId", "actionId");

-- CreateIndex
CREATE INDEX "LexDevelopmentEvent_organizationId_entity_entityId_createdA_idx" ON "LexDevelopmentEvent"("organizationId", "entity", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "LexReview" ADD CONSTRAINT "LexReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexReviewVersion" ADD CONSTRAINT "LexReviewVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "LexReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexReviewAcknowledgement" ADD CONSTRAINT "LexReviewAcknowledgement_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "LexReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexCoachingRecord" ADD CONSTRAINT "LexCoachingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexDevelopmentActionLink" ADD CONSTRAINT "LexDevelopmentActionLink_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "LexReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexDevelopmentActionLink" ADD CONSTRAINT "LexDevelopmentActionLink_coachingId_fkey" FOREIGN KEY ("coachingId") REFERENCES "LexCoachingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexActionEffectiveness" ADD CONSTRAINT "LexActionEffectiveness_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexDevelopmentEvent" ADD CONSTRAINT "LexDevelopmentEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

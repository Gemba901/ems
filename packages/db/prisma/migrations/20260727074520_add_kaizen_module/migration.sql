CREATE TYPE "KaizenStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED_FOR_VERIFICATION', 'VERIFIED_CLOSED', 'FURTHER_IMPROVEMENT_REQUIRED', 'MOVED_TO_SGA');

CREATE TABLE "Kaizen" (
  "id"                     TEXT           NOT NULL,
  "organizationId"         TEXT           NOT NULL,
  "employeeId"             TEXT           NOT NULL,
  "departmentId"           TEXT           NOT NULL,
  "status"                 "KaizenStatus" NOT NULL DEFAULT 'DRAFT',
  "problem"                TEXT           NOT NULL,
  "beforePhotoUrl"         TEXT           NOT NULL,
  "improvementDescription" TEXT           NOT NULL,
  "afterPhotoUrl"          TEXT           NOT NULL,
  "benefitAchieved"        TEXT           NOT NULL,
  "teamMembers"            TEXT,
  "benefitCategory"        TEXT,
  "beforeValue"            TEXT,
  "afterValue"             TEXT,
  "costSaving"             TEXT,
  "comments"               TEXT,
  "verifiedById"           TEXT,
  "verificationComment"    TEXT,
  "standardUpdated"        BOOLEAN,
  "linkedSgaId"            TEXT,
  "createdAt"              TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Kaizen_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KaizenReview" (
  "id"            TEXT           NOT NULL,
  "kaizenId"      TEXT           NOT NULL,
  "reviewerId"    TEXT           NOT NULL,
  "statusChanged" "KaizenStatus" NOT NULL,
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KaizenReview_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Kaizen"
  ADD CONSTRAINT "Kaizen_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Kaizen"
  ADD CONSTRAINT "Kaizen_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Kaizen"
  ADD CONSTRAINT "Kaizen_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Kaizen"
  ADD CONSTRAINT "Kaizen_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KaizenReview"
  ADD CONSTRAINT "KaizenReview_kaizenId_fkey"
  FOREIGN KEY ("kaizenId") REFERENCES "Kaizen"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KaizenReview"
  ADD CONSTRAINT "KaizenReview_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Kaizen_organizationId_status_idx" ON "Kaizen"("organizationId", "status");

CREATE INDEX "Kaizen_employeeId_createdAt_idx" ON "Kaizen"("employeeId", "createdAt");

CREATE TABLE "LexPlanningWorkspace" (
  "organizationId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LexPlanningWorkspace_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "LexPlanningWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LexPlanningEvidence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LexPlanningEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LexPlanningEvidence_workspace_fkey" FOREIGN KEY ("organizationId") REFERENCES "LexPlanningWorkspace"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LexPlanningEvidence_size_check" CHECK ("size" >= 0 AND "size" <= 512000)
);
CREATE INDEX "LexPlanningEvidence_organizationId_findingId_idx" ON "LexPlanningEvidence"("organizationId", "findingId");

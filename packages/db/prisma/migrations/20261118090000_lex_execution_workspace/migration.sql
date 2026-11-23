-- Execution data references the existing Area 03 planning IDs and versions.
CREATE TABLE "LexExecutionWorkspace" (
  "organizationId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LexExecutionWorkspace_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "LexExecutionWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

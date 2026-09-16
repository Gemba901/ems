CREATE TABLE "FileAsset" (
 "id" TEXT PRIMARY KEY,
 "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "uploadedBy" TEXT NOT NULL,
 "key" TEXT NOT NULL,
 "fileName" TEXT NOT NULL,
 "contentType" TEXT NOT NULL,
 "size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 20971520),
 "folder" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'READY', 'REJECTED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FileAsset_organizationId_status_idx" ON "FileAsset"("organizationId", "status");
CREATE TABLE "ScheduledJobRun" (
 "key" TEXT PRIMARY KEY,
 "window" TEXT NOT NULL,
 "leaseId" TEXT NOT NULL,
 "leaseUntil" TIMESTAMP(3) NOT NULL,
 "completedAt" TIMESTAMP(3),
 "attempts" INTEGER NOT NULL DEFAULT 1,
 "failedAt" TIMESTAMP(3),
 "updatedAt" TIMESTAMP(3) NOT NULL
);

-- First RLS slice: every FileAsset access is wired through transaction-local context.
-- Business tables remain under application isolation until their own reviewed rollout.
ALTER TABLE "FileAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileAsset" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FileAsset_tenant_isolation" ON "FileAsset"
 USING ("organizationId" = current_setting('gemba.organization_id', true))
 WITH CHECK ("organizationId" = current_setting('gemba.organization_id', true));

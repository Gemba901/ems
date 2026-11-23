-- Area 05 Monitoring & Control only: per-organisation "needs attention" band. No existing tables are changed.
-- CreateTable
CREATE TABLE "LexMonitoringSettings" (
    "organizationId" TEXT NOT NULL,
    "warningTolerancePct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LexMonitoringSettings_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "LexMonitoringSettings" ADD CONSTRAINT "LexMonitoringSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

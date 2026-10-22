-- Join 8: an action event for an SGA raised from a repeat finding
ALTER TYPE "FiveSActionEventType" ADD VALUE 'SGA_RAISED';

-- Join 12: a 5S standard written to lock in a closed Kaizen or SGA
ALTER TABLE "FiveSStandard" ADD COLUMN "sourceKaizenId" TEXT;
ALTER TABLE "FiveSStandard" ADD COLUMN "sourceSgaId" TEXT;

CREATE INDEX "FiveSStandard_sourceKaizenId_idx" ON "FiveSStandard"("sourceKaizenId");
CREATE INDEX "FiveSStandard_sourceSgaId_idx" ON "FiveSStandard"("sourceSgaId");

ALTER TABLE "FiveSStandard" ADD CONSTRAINT "FiveSStandard_sourceKaizenId_fkey" FOREIGN KEY ("sourceKaizenId") REFERENCES "Kaizen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FiveSStandard" ADD CONSTRAINT "FiveSStandard_sourceSgaId_fkey" FOREIGN KEY ("sourceSgaId") REFERENCES "Sga"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Join 8: an SGA raised from a 5S action whose checkpoint keeps failing audits
ALTER TABLE "Sga" ADD COLUMN "sourceFiveSActionId" TEXT;

CREATE UNIQUE INDEX "Sga_sourceFiveSActionId_key" ON "Sga"("sourceFiveSActionId");

ALTER TABLE "Sga" ADD CONSTRAINT "Sga_sourceFiveSActionId_fkey" FOREIGN KEY ("sourceFiveSActionId") REFERENCES "FiveSAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

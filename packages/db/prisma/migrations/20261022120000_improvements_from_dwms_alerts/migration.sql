-- Join 10: a Kaizen or SGA raised from a DWMS alert / abnormality keeps a typed link to it.

-- AlterTable
ALTER TABLE "Kaizen" ADD COLUMN "sourceAlertId" TEXT;
ALTER TABLE "Sga" ADD COLUMN "sourceAlertId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Kaizen_sourceAlertId_key" ON "Kaizen"("sourceAlertId");
CREATE UNIQUE INDEX "Sga_sourceAlertId_key" ON "Sga"("sourceAlertId");

-- AddForeignKey
ALTER TABLE "Kaizen" ADD CONSTRAINT "Kaizen_sourceAlertId_fkey" FOREIGN KEY ("sourceAlertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sga" ADD CONSTRAINT "Sga_sourceAlertId_fkey" FOREIGN KEY ("sourceAlertId") REFERENCES "Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

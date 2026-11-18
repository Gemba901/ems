-- Additive: remembered import column choices per organisation. No existing data changes.
CREATE TABLE "EmsImportColumnChoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "headingKey" VARCHAR(200) NOT NULL,
    "heading" VARCHAR(200) NOT NULL,
    "destination" VARCHAR(80) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmsImportColumnChoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmsImportColumnChoice_organizationId_headingKey_key" ON "EmsImportColumnChoice"("organizationId", "headingKey");

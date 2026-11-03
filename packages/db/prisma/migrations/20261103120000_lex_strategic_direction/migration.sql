-- CreateEnum
CREATE TYPE "LexStrategicDirectionAction" AS ENUM ('DRAFT_SAVED', 'SUBMITTED', 'RETURNED', 'WITHDRAWN', 'APPROVED', 'REVISION_STARTED');

-- CreateEnum
CREATE TYPE "LexWorkflowStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED');


-- CreateTable
CREATE TABLE "LexStrategicDirection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "LexWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "company" TEXT,
    "business" TEXT,
    "purpose" TEXT,
    "vision" TEXT,
    "visionWhy" TEXT,
    "mission" TEXT,
    "missionWhy" TEXT,
    "values" JSONB NOT NULL DEFAULT '[]',
    "sectionMeta" JSONB NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "returnReason" TEXT,
    "revisionReason" TEXT,
    "currentVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LexStrategicDirection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexStrategicDirectionVersion" (
    "id" TEXT NOT NULL,
    "directionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sectionMeta" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,

    CONSTRAINT "LexStrategicDirectionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LexStrategicDirectionEvent" (
    "id" TEXT NOT NULL,
    "directionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "action" "LexStrategicDirectionAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT,
    "version" INTEGER,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LexStrategicDirectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LexStrategicDirection_organizationId_key" ON "LexStrategicDirection"("organizationId");

-- CreateIndex
CREATE INDEX "LexStrategicDirectionVersion_organizationId_idx" ON "LexStrategicDirectionVersion"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LexStrategicDirectionVersion_directionId_version_key" ON "LexStrategicDirectionVersion"("directionId", "version");

-- CreateIndex
CREATE INDEX "LexStrategicDirectionEvent_directionId_createdAt_idx" ON "LexStrategicDirectionEvent"("directionId", "createdAt");

-- CreateIndex
CREATE INDEX "LexStrategicDirectionEvent_organizationId_idx" ON "LexStrategicDirectionEvent"("organizationId");

-- AddForeignKey
ALTER TABLE "LexStrategicDirection" ADD CONSTRAINT "LexStrategicDirection_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirection" ADD CONSTRAINT "LexStrategicDirection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionVersion" ADD CONSTRAINT "LexStrategicDirectionVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionVersion" ADD CONSTRAINT "LexStrategicDirectionVersion_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "LexStrategicDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionEvent" ADD CONSTRAINT "LexStrategicDirectionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LexStrategicDirectionEvent" ADD CONSTRAINT "LexStrategicDirectionEvent_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "LexStrategicDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "CommitteeType" AS ENUM ('QUALITY', 'COST', 'DELIVERY', 'SAFETY', 'MORALE', 'TECHNOLOGY', 'GENERAL');

-- CreateTable
CREATE TABLE "SteeringCommittee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommitteeType" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteeringCommittee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteeringCommitteeMember" (
    "committeeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "SteeringCommitteeMember_pkey" PRIMARY KEY ("committeeId","employeeId")
);

-- AlterTable
ALTER TABLE "SuggestionReview" ADD COLUMN "reviewerCommitteeId" TEXT;

-- AddForeignKey
ALTER TABLE "SteeringCommittee" ADD CONSTRAINT "SteeringCommittee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteeringCommitteeMember" ADD CONSTRAINT "SteeringCommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "SteeringCommittee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SteeringCommitteeMember" ADD CONSTRAINT "SteeringCommitteeMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggestionReview" ADD CONSTRAINT "SuggestionReview_reviewerCommitteeId_fkey" FOREIGN KEY ("reviewerCommitteeId") REFERENCES "SteeringCommittee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

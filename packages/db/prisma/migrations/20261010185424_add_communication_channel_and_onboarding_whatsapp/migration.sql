-- CreateEnum
CREATE TYPE "OrgCommunicationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- AlterTable
ALTER TABLE "EmsOnboardingRecord" ADD COLUMN     "whatsappNumber" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "communicationChannel" "OrgCommunicationChannel";

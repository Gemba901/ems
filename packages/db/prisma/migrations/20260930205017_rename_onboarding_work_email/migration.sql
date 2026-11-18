/*
  Warnings:

  - You are about to drop the column `companyEmail` on the `EmsOnboardingRecord` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EmsOnboardingRecord" DROP COLUMN "companyEmail",
ADD COLUMN     "workEmail" TEXT;

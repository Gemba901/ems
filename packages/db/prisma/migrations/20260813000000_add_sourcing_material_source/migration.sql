-- CreateEnum
CREATE TYPE "SteelSourcingMaterialSource" AS ENUM ('EXISTING_STOCK', 'EXTERNAL_SUPPLIER');

-- AlterTable
ALTER TABLE "SteelSourcingOrder" ADD COLUMN "materialSource" "SteelSourcingMaterialSource";
ALTER TABLE "SteelSourcingOrder" ADD COLUMN "stockFulfillmentNotes" TEXT;

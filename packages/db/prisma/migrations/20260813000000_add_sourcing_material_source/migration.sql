-- Prepared but NOT applied against the live database — run `prisma migrate deploy`
-- (or `prisma migrate dev`) manually once reviewed.

-- CreateEnum
CREATE TYPE "SteelSourcingMaterialSource" AS ENUM ('EXISTING_STOCK', 'EXTERNAL_SUPPLIER');

-- AlterTable
ALTER TABLE "SteelSourcingOrder" ADD COLUMN "materialSource" "SteelSourcingMaterialSource";
ALTER TABLE "SteelSourcingOrder" ADD COLUMN "stockFulfillmentNotes" TEXT;

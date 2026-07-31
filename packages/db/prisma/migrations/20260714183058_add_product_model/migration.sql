-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('TMT_BAR', 'BILLET', 'WIRE_ROD', 'ANGLE', 'CHANNEL', 'FLAT_BAR', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('TON', 'KG', 'PIECE', 'METER');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "grade" TEXT NOT NULL,
    "standard" TEXT,
    "diameter" DOUBLE PRECISION,
    "unit" "ProductUnit" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_code_idx" ON "Product"("code");

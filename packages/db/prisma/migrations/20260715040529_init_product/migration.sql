/*
  Warnings:

  - The values [OTHER] on the enum `ProductCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `active` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `grade` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[productCode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `productCode` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productName` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `steelGrade` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
BEGIN;
CREATE TYPE "ProductCategory_new" AS ENUM ('TMT_BAR', 'BILLET', 'WIRE_ROD', 'COIL', 'ANGLE', 'CHANNEL', 'FLAT_BAR');
ALTER TABLE "Product" ALTER COLUMN "category" TYPE "ProductCategory_new" USING ("category"::text::"ProductCategory_new");
ALTER TYPE "ProductCategory" RENAME TO "ProductCategory_old";
ALTER TYPE "ProductCategory_new" RENAME TO "ProductCategory";
DROP TYPE "public"."ProductCategory_old";
COMMIT;

-- DropIndex
DROP INDEX "Product_code_idx";

-- DropIndex
DROP INDEX "Product_code_key";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "active",
DROP COLUMN "code",
DROP COLUMN "grade",
DROP COLUMN "name",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "length" DOUBLE PRECISION,
ADD COLUMN     "productCode" TEXT NOT NULL,
ADD COLUMN     "productName" TEXT NOT NULL,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "steelGrade" TEXT NOT NULL,
ADD COLUMN     "unitWeight" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "Product_productCode_key" ON "Product"("productCode");

-- CreateIndex
CREATE INDEX "Product_productCode_idx" ON "Product"("productCode");

-- CreateIndex
CREATE INDEX "Product_steelGrade_idx" ON "Product"("steelGrade");

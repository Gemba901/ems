-- AlterTable
ALTER TABLE "User" ADD COLUMN     "completedTours" TEXT[] DEFAULT ARRAY[]::TEXT[];

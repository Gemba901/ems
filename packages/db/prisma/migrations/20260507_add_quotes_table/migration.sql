-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'NIGHT');

-- CreateEnum
CREATE TYPE "QuoteCategory" AS ENUM ('MOTIVATION', 'PRODUCTIVITY', 'WELLNESS', 'CODING', 'LEADERSHIP', 'STUDY');

-- CreateTable
CREATE TABLE "quotes" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid(),
    "text"      TEXT NOT NULL,
    "category"  "QuoteCategory",
    "mood"      TEXT,
    "timeOfDay" "TimeOfDay"[],
    "tags"      TEXT[],
    "author"    TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quotes_timeOfDay_idx" ON "quotes" USING GIN ("timeOfDay");
CREATE INDEX "quotes_active_idx" ON "quotes" ("active");

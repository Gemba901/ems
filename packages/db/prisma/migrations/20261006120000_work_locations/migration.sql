-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('ON_SITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "WorkPlaceKind" AS ENUM ('SITE', 'HOME');

-- CreateEnum
CREATE TYPE "AttendanceLocationCheck" AS ENUM ('INSIDE', 'OUTSIDE', 'NO_LOCATION', 'NO_APPROVED_PLACE', 'LOW_ACCURACY');

-- CreateEnum
CREATE TYPE "HomeLocationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "arrangementAtClockIn" "WorkArrangement",
ADD COLUMN     "checkedPlaceKind" "WorkPlaceKind",
ADD COLUMN     "checkedPlaceLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkedPlaceLongitude" DOUBLE PRECISION,
ADD COLUMN     "checkedPlaceName" TEXT,
ADD COLUMN     "checkedPlaceRadiusMeters" INTEGER,
ADD COLUMN     "distanceMeters" INTEGER,
ADD COLUMN     "locationCheck" "AttendanceLocationCheck";

-- AlterTable
ALTER TABLE "WorkSettings" ADD COLUMN     "homeRadiusMeters" INTEGER NOT NULL DEFAULT 150;

-- CreateTable
CREATE TABLE "WorkSite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEmployeeProfile" (
    "employeeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "arrangement" "WorkArrangement" NOT NULL DEFAULT 'ON_SITE',
    "homeLatitude" DOUBLE PRECISION,
    "homeLongitude" DOUBLE PRECISION,
    "homeApprovedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkEmployeeProfile_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "WorkHomeLocationRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "HomeLocationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkHomeLocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSite_organizationId_idx" ON "WorkSite"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSite_organizationId_name_key" ON "WorkSite"("organizationId", "name");

-- CreateIndex
CREATE INDEX "WorkEmployeeProfile_organizationId_arrangement_idx" ON "WorkEmployeeProfile"("organizationId", "arrangement");

-- CreateIndex
CREATE INDEX "WorkHomeLocationRequest_organizationId_status_idx" ON "WorkHomeLocationRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WorkHomeLocationRequest_employeeId_createdAt_idx" ON "WorkHomeLocationRequest"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEmployeeProfile" ADD CONSTRAINT "WorkEmployeeProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEmployeeProfile" ADD CONSTRAINT "WorkEmployeeProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Constraints ------------------------------------------------------------------
-- BETWEEN and < 'Infinity' also reject NaN and Infinity.

ALTER TABLE "WorkSettings" ADD CONSTRAINT "WorkSettings_home_radius_range" CHECK ("homeRadiusMeters" BETWEEN 25 AND 5000);

ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120);
ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_radius_range" CHECK ("radiusMeters" BETWEEN 25 AND 5000);

-- A home is either fully approved or absent.
ALTER TABLE "WorkEmployeeProfile" ADD CONSTRAINT "WorkEmployeeProfile_home_complete" CHECK (
  ("homeLatitude" IS NULL AND "homeLongitude" IS NULL AND "homeApprovedAt" IS NULL)
  OR ("homeLatitude" BETWEEN -90 AND 90 AND "homeLongitude" BETWEEN -180 AND 180 AND "homeApprovedAt" IS NOT NULL)
);

ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_accuracy_check" CHECK ("accuracyMeters" > 0 AND "accuracyMeters" < 'Infinity');
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500);
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_review_note_length" CHECK ("reviewNote" IS NULL OR char_length("reviewNote") <= 500);
ALTER TABLE "WorkHomeLocationRequest" ADD CONSTRAINT "WorkHomeLocationRequest_reviewed_complete" CHECK (
  ("status" IN ('PENDING', 'CANCELLED') AND "reviewedAt" IS NULL)
  OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewedAt" IS NOT NULL)
);
-- At most one request waiting per employee; a new capture cancels the old one.
CREATE UNIQUE INDEX "WorkHomeLocationRequest_one_pending" ON "WorkHomeLocationRequest"("employeeId") WHERE "status" = 'PENDING';

-- The checked place is copied whole or not at all.
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_checked_place_complete" CHECK (
  ("checkedPlaceKind" IS NULL AND "checkedPlaceName" IS NULL AND "checkedPlaceLatitude" IS NULL
    AND "checkedPlaceLongitude" IS NULL AND "checkedPlaceRadiusMeters" IS NULL AND "distanceMeters" IS NULL)
  OR ("checkedPlaceKind" IS NOT NULL AND "checkedPlaceName" IS NOT NULL AND "checkedPlaceLatitude" IS NOT NULL
    AND "checkedPlaceLongitude" IS NOT NULL AND "checkedPlaceRadiusMeters" IS NOT NULL AND "distanceMeters" >= 0)
);

-- CreateEnum
CREATE TYPE "CalendarBlockType" AS ENUM ('HOLIDAY', 'BUSY_DAY');

-- CreateTable
CREATE TABLE "CalendarBlock" (
    "id"          TEXT NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL,
    "type"        "CalendarBlockType" NOT NULL,
    "label"       TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

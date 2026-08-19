-- AlterTable: add new scalar columns
ALTER TABLE "Kaizen" ADD COLUMN     "title" TEXT;
ALTER TABLE "Kaizen" ADD COLUMN     "targetCompletionDate" TIMESTAMP(3);
ALTER TABLE "Kaizen" ADD COLUMN     "beforePhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: move the existing single before-photo into the new array column
UPDATE "Kaizen" SET "beforePhotoUrls" = ARRAY["beforePhotoUrl"] WHERE "beforePhotoUrl" IS NOT NULL AND "beforePhotoUrl" <> '';

-- AlterTable: drop the now-superseded single-photo and freeform team-members columns
ALTER TABLE "Kaizen" DROP COLUMN "beforePhotoUrl";
ALTER TABLE "Kaizen" DROP COLUMN "teamMembers";

-- CreateTable: implicit m2m join table for Kaizen <-> Employee team members
CREATE TABLE "_KaizenTeamMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_KaizenTeamMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_KaizenTeamMembers_B_index" ON "_KaizenTeamMembers"("B");

-- AddForeignKey
ALTER TABLE "_KaizenTeamMembers" ADD CONSTRAINT "_KaizenTeamMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_KaizenTeamMembers" ADD CONSTRAINT "_KaizenTeamMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "Kaizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

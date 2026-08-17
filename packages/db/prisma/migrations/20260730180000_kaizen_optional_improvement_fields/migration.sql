-- Kaizen.improvementDescription/afterPhotoUrl/benefitAchieved are filled in later
-- (during Update Improvement / Verify), not at creation time. schema.prisma already
-- marks them optional; the original migration created them NOT NULL, causing
-- creation to fail with a NullConstraintViolation. Align the DB with the schema.
ALTER TABLE "Kaizen" ALTER COLUMN "improvementDescription" DROP NOT NULL;
ALTER TABLE "Kaizen" ALTER COLUMN "afterPhotoUrl" DROP NOT NULL;
ALTER TABLE "Kaizen" ALTER COLUMN "benefitAchieved" DROP NOT NULL;

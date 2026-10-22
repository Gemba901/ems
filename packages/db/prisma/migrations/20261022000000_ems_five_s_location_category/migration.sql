-- Additive: existing people and imports remain unclassified. No inferred defaults.
CREATE TYPE "EmsFiveSLocationCategory" AS ENUM ('STORE', 'OFFICE', 'PRODUCTION_SHOP_FLOOR');
ALTER TABLE "Employee" ADD COLUMN "fiveSLocationCategory" "EmsFiveSLocationCategory";
ALTER TABLE "EmsOnboardingRecord" ADD COLUMN "fiveSLocationCategory" TEXT;

-- Additive: existing pending signups can still complete without profile fields.
ALTER TABLE "OnboardingRequest"
  ADD COLUMN "shortName" TEXT,
  ADD COLUMN "industry" TEXT,
  ADD COLUMN "companyEmail" TEXT,
  ADD COLUMN "companyPhone" TEXT,
  ADD COLUMN "companyAddress" TEXT,
  ADD COLUMN "provisioningStage" TEXT;

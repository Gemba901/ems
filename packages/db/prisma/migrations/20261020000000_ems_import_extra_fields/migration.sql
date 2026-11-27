-- Additive: old imports and employee profiles keep their existing data.
ALTER TABLE "EmsOnboardingRecord" ADD COLUMN "extraFields" JSONB;
ALTER TABLE "Employee" ADD COLUMN "importedExtraFields" JSONB;

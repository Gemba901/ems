-- Caps user-triggered provisioning retries, and records when the Vercel domain
-- of a request that never became a company was removed.
ALTER TABLE "OnboardingRequest" ADD COLUMN IF NOT EXISTS "manualRetries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OnboardingRequest" ADD COLUMN IF NOT EXISTS "domainRemovedAt" TIMESTAMP(3);

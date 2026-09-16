CREATE TABLE "OnboardingRequest" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "requestKeyHash" TEXT NOT NULL UNIQUE,
 "fingerprint" TEXT NOT NULL,
 "slug" TEXT UNIQUE,
 "requestedSlug" TEXT NOT NULL,
 "companyName" TEXT NOT NULL,
 "firstName" TEXT NOT NULL,
 "lastName" TEXT NOT NULL,
 "email" TEXT NOT NULL,
 "phone" TEXT NOT NULL,
 "timeZone" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
 "verificationHash" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "verifiedAt" TIMESTAMP(3),
 "passwordHash" TEXT,
 "existingUserId" TEXT,
 "organizationId" TEXT UNIQUE,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "failureCode" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "OnboardingRequest_status_check" CHECK ("status" IN ('PENDING_VERIFICATION', 'PROVISIONING', 'READY', 'FAILED', 'EXPIRED'))
);
CREATE INDEX "OnboardingRequest_status_nextAttemptAt_idx" ON "OnboardingRequest"("status", "nextAttemptAt");
CREATE INDEX "OnboardingRequest_email_createdAt_idx" ON "OnboardingRequest"("email", "createdAt");
CREATE TABLE "OnboardingMessage" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "requestId" TEXT NOT NULL REFERENCES "OnboardingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "kind" TEXT NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseId" TEXT,
 "leaseUntil" TIMESTAMP(3),
 "sentAt" TIMESTAMP(3),
 "failedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "OnboardingMessage_requestId_kind_key" UNIQUE ("requestId", "kind"),
 CONSTRAINT "OnboardingMessage_kind_check" CHECK ("kind" IN ('VERIFY', 'WELCOME'))
);
CREATE INDEX "OnboardingMessage_sentAt_failedAt_availableAt_idx" ON "OnboardingMessage"("sentAt", "failedAt", "availableAt");

-- Additive: one current account invitation per employee. No existing data changes.
CREATE TABLE "EmsInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(20) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "destination" VARCHAR(320),
    "skipReason" VARCHAR(200),
    "lastError" VARCHAR(500),
    "tokenHash" VARCHAR(64),
    "expiresAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmsInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmsInvitation_employeeId_key" ON "EmsInvitation"("employeeId");
CREATE UNIQUE INDEX "EmsInvitation_tokenHash_key" ON "EmsInvitation"("tokenHash");
CREATE INDEX "EmsInvitation_organizationId_status_idx" ON "EmsInvitation"("organizationId", "status");

ALTER TABLE "EmsInvitation" ADD CONSTRAINT "EmsInvitation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

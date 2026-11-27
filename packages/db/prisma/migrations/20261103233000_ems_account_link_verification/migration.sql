BEGIN;
-- CreateTable
CREATE TABLE "EmsAccountLink" (
    "employeeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" INTEGER NOT NULL,
    "requestedPhone" TEXT NOT NULL,
    "importedEmail" TEXT,
    "contactMatches" BOOLEAN,
    "sourceKind" TEXT,
    "sourceEmployeeId" TEXT,
    "destination" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "tokenHash" VARCHAR(64),
    "expiresAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verificationMethod" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmsAccountLink_pkey" PRIMARY KEY ("employeeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmsAccountLink_tokenHash_key" ON "EmsAccountLink"("tokenHash");

-- CreateIndex
CREATE INDEX "EmsAccountLink_userId_status_idx" ON "EmsAccountLink"("userId", "status");

-- CreateIndex
CREATE INDEX "EmsAccountLink_organizationId_status_idx" ON "EmsAccountLink"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "EmsAccountLink" ADD CONSTRAINT "EmsAccountLink_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsAccountLink" ADD CONSTRAINT "EmsAccountLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsAccountLink" ADD CONSTRAINT "EmsAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmsAccountLink" ADD CONSTRAINT "EmsAccountLink_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmsAccountLink" ADD CONSTRAINT "EmsAccountLink_status_check"
CHECK (status IN ('PENDING', 'SENT', 'VERIFIED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'FAILED'));
ALTER TABLE "EmsAccountLink" ADD CONSTRAINT "EmsAccountLink_verification_check"
CHECK (status NOT IN ('VERIFIED', 'ACCEPTED') OR ("verifiedAt" IS NOT NULL AND "verificationMethod" IS NOT NULL AND "verificationMethod" = 'DIRECT_EMAIL_LINK' AND destination IS NOT NULL));
COMMIT;

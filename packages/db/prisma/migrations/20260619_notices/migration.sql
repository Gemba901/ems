CREATE TABLE "Notice" (
  "id"             TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "type"           TEXT         NOT NULL DEFAULT 'INFO',
  "title"          TEXT         NOT NULL,
  "body"           TEXT         NOT NULL,
  "pinned"         BOOLEAN      NOT NULL DEFAULT false,
  "expiresAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Notice_organizationId_createdAt_idx" ON "Notice"("organizationId", "createdAt");

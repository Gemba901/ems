CREATE TABLE "LeavePolicy" (
    "id"             TEXT         NOT NULL,
    "organizationId" TEXT         NOT NULL,
    "year"           INTEGER      NOT NULL,
    "type"           "LeaveType"  NOT NULL,
    "allocated"      INTEGER      NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeavePolicy_organizationId_year_type_key"
    ON "LeavePolicy"("organizationId", "year", "type");

CREATE INDEX "LeavePolicy_organizationId_year_idx"
    ON "LeavePolicy"("organizationId", "year");

ALTER TABLE "LeavePolicy"
    ADD CONSTRAINT "LeavePolicy_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

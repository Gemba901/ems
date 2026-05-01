-- CreateTable: UserOrganization join table
CREATE TABLE "UserOrganization" (
    "userId"         TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "roleId"         INTEGER NOT NULL,

    CONSTRAINT "UserOrganization_pkey" PRIMARY KEY ("userId", "organizationId")
);

-- Migrate existing User.organizationId + User.roleId into UserOrganization
INSERT INTO "UserOrganization" ("userId", "organizationId", "roleId")
SELECT "id", "organizationId", "roleId"
FROM "User"
WHERE "organizationId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old columns from User
ALTER TABLE "User" DROP COLUMN "organizationId";
ALTER TABLE "User" DROP COLUMN "roleId";

-- Drop unique constraint on Employee.userId (user can be employee in multiple orgs)
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_userId_key";

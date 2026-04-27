-- CreateEnum RoleName (idempotent)
DO $$ BEGIN
  CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'HOD', 'EMPLOYEE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop foreign keys if they still exist
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_roleId_fkey";
ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_roleId_fkey";

-- Add new columns to Role (idempotent)
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "id_new" INTEGER;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "name_new" "RoleName";

-- Migrate Role data
UPDATE "Role"
SET
  "id_new" = CASE "name"
    WHEN 'SUPER_ADMIN' THEN 1
    WHEN 'ADMIN' THEN 2
    WHEN 'MANAGEMENT' THEN 3
    WHEN 'HOD' THEN 4
    WHEN 'EMPLOYEE' THEN 5
    ELSE NULL
  END,
  "name_new" = CAST("name" AS "RoleName")
WHERE "name" IN ('SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'HOD', 'EMPLOYEE');

-- Add new roleId column to User (idempotent)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roleId_new" INTEGER;

-- Migrate User.roleId data
UPDATE "User" u
SET "roleId_new" = r."id_new"
FROM "Role" r
WHERE u."roleId" = r."id";

-- Add new roleId column to RolePermission (idempotent)
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "roleId_new" INTEGER;

-- Migrate RolePermission.roleId data
UPDATE "RolePermission" rp
SET "roleId_new" = r."id_new"
FROM "Role" r
WHERE rp."roleId" = r."id";

-- Drop old columns (only if new columns exist and are populated)
ALTER TABLE "RolePermission" DROP COLUMN IF EXISTS "roleId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "roleId";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "id";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "name";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "organizationId";

-- Rename new columns to original names
DO $$ BEGIN
  ALTER TABLE "RolePermission" RENAME COLUMN "roleId_new" TO "roleId";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "User" RENAME COLUMN "roleId_new" TO "roleId";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Role" RENAME COLUMN "id_new" TO "id";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Role" RENAME COLUMN "name_new" TO "name";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Add primary key (drop first if exists from old schema)
ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_pkey";
ALTER TABLE "Role" ADD PRIMARY KEY ("id");

-- Add unique constraint (idempotent)
ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_name_key";
ALTER TABLE "Role" ADD CONSTRAINT "Role_name_key" UNIQUE ("name");

-- Restore foreign keys
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_roleId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RolePermission" DROP CONSTRAINT IF EXISTS "RolePermission_roleId_fkey";
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the 5 global roles (DELETE + INSERT is idempotent)
DELETE FROM "Role";

INSERT INTO "Role" ("id", "name") VALUES
  (1, 'SUPER_ADMIN'),
  (2, 'ADMIN'),
  (3, 'MANAGEMENT'),
  (4, 'HOD'),
  (5, 'EMPLOYEE');

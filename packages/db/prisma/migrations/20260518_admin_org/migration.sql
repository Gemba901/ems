-- Add isAdminOrg flag to Organization
-- Only one organization should have this set to true (the platform/consultancy company).
ALTER TABLE "Organization" ADD COLUMN "isAdminOrg" BOOLEAN NOT NULL DEFAULT false;

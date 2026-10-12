-- Minimal local development data, run by the docker compose "setup" service.
-- Creates the gemba-pms workspace and one SUPER_ADMIN so a fresh database can log in:
--   admin@gemba.local / Admin@12345   (local only, never run against staging or production)
-- Does nothing if any organization already exists.
DO $$
DECLARE
  org_id  text := gen_random_uuid()::text;
  dept_id text := gen_random_uuid()::text;
  user_id text := gen_random_uuid()::text;
BEGIN
  IF EXISTS (SELECT 1 FROM "Organization") THEN
    RAISE NOTICE 'dev-seed: organizations exist, skipping';
    RETURN;
  END IF;

  INSERT INTO "Organization" (id, name, "shortName", slug, status, modules, "isAdminOrg", "updatedAt")
  VALUES (org_id, 'Gemba PMS', 'Gemba', 'gemba-pms', 'ACTIVE',
          enum_range(NULL::"ModuleType"), true, now());

  INSERT INTO "Department" (id, name, "organizationId")
  VALUES (dept_id, 'Management', org_id);

  INSERT INTO "User" (id, email, phone, password, name)
  VALUES (user_id, 'admin@gemba.local', '+254700000000',
          '$2b$10$URfeGuinmUR9fbc7qqLXcuhU1trxDbX185dcoxPO1MGylrQbUBuBW', 'Local Admin');

  INSERT INTO "UserOrganization" ("userId", "organizationId", "roleId")
  VALUES (user_id, org_id, (SELECT id FROM "Role" WHERE name = 'SUPER_ADMIN'));

  INSERT INTO "Employee" (id, "firstName", "lastName", email, phone, "organizationId",
                          "departmentId", "userId", "employeeCode", "jobTitle", "updatedAt")
  VALUES (gen_random_uuid()::text, 'Local', 'Admin', 'admin@gemba.local', '+254700000000',
          org_id, dept_id, user_id, 'DEV-0001', 'Administrator', now());
END $$;

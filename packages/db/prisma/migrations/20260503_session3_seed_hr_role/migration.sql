-- Seed HR role — must run in a separate transaction after the RoleName enum
-- value 'HR' has been committed (see 20260503_session3_admin_and_hr).
INSERT INTO "Role" ("id", "name") VALUES (6, 'HR') ON CONFLICT ("id") DO NOTHING;

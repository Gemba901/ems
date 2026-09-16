-- Run deliberately as the database/migration administrator in STAGING.
-- This creates a privilege group, not a login or a password. Grant it to a
-- dedicated runtime login through your normal secret-management procedure.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gemba_runtime') THEN
    CREATE ROLE gemba_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO gemba_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gemba_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gemba_runtime;
-- Default privileges apply to objects subsequently created by the role running this script.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gemba_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gemba_runtime;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM gemba_runtime;
  END IF;
END $$;
-- Do not make the runtime login a table owner, superuser, or a member of a bypass role.
-- Do not run Prisma migrations using the runtime login.

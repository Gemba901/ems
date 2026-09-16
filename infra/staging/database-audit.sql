BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database, current_user AS runtime_user,
       rolsuper AS superuser, rolbypassrls AS bypass_rls
FROM pg_roles WHERE rolname = current_user;
SELECT c.relname AS tenant_table, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owned_by_runtime,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND EXISTS (
  SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organizationId' AND NOT a.attisdropped
) ORDER BY c.relname;
SELECT count(*) AS active_companies_missing_slug FROM "Organization" WHERE status='ACTIVE' AND slug IS NULL;
SELECT status, count(*) FROM "OnboardingRequest" GROUP BY status;
SELECT kind, count(*) FILTER (WHERE "sentAt" IS NULL AND "failedAt" IS NULL) AS pending,
       count(*) FILTER (WHERE "failedAt" IS NOT NULL) AS failed FROM "OnboardingMessage" GROUP BY kind;
SELECT key, "window", attempts, "completedAt", "failedAt", "leaseUntil" FROM "ScheduledJobRun" ORDER BY key;
COMMIT;

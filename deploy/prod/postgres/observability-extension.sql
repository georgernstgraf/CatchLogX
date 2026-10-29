-- Query observability, native-cluster part (#170).
--
-- On production the SETTINGS live in /etc/postgresql/16/main/conf.d/99-catchlogx.conf
-- (versioned in this directory), not in postgresql.auto.conf: shared_preload_libraries
-- is a postmaster setting and was written once, before the first start, instead of
-- through the two-pass ALTER SYSTEM dance that #169 needed in the container era.
--
-- What is left to do on the running server is exactly two statements: create the
-- extension (it needs the preloaded library) and take the PUBLIC grant away.
--
-- Run as the app role over the local socket (peer auth, no password):
--   runuser -u clxadmin -- psql -d clx -f deploy/prod/postgres/observability-extension.sql
--
-- The full apply/report/rollback procedure is in deploy/postgres/README.md.

\set ON_ERROR_STOP on

-- Extension GUCs are already set in conf.d; these two lines only take effect
-- because the library is preloaded. Idempotent.
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET pg_stat_statements.track_utility = on;
SELECT pg_reload_conf();

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- pg_stat_statements--1.10.sql grants SELECT to PUBLIC when the extension is
-- created; the view shows the query text of EVERY role. Without this REVOKE
-- the published clx_readonly password could read the auth flows and every app
-- query (#169).
REVOKE SELECT ON pg_stat_statements FROM PUBLIC;

-- Constants become $1, so the report never contains research values.
SELECT name, setting
FROM pg_settings
WHERE name IN ('shared_preload_libraries', 'pg_stat_statements.track',
               'auto_explain.log_min_duration', 'log_min_duration_statement',
               'logging_collector', 'log_directory', 'ssl')
ORDER BY name;

SELECT count(*) AS statements_tracked FROM pg_stat_statements;

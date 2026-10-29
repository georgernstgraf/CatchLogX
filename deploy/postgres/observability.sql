-- Query observability for index forensics (#169).
--
-- Goal: make missing indexes provable from the real workload - without
-- logging every statement. `log_statement = 'all'` is deliberately NOT used:
-- it would write research data and full literals to disk, and raw text cannot
-- be aggregated per query shape.
--
--   pg_stat_statements  normalised statements (constants become $1), aggregated
--                       per shape: calls, total/mean exec time, rows, block
--                       reads, temp writes, and userid (filter clx_readonly)
--   auto_explain        real plan with BUFFERS for everything slower than
--                       500 ms - this is what turns "this query is slow" into
--                       "this Seq Scan on fish_catches costs it"
--   slow query log      net for the rest, threshold 2 s, WITHOUT bind
--                       parameters (`log_parameter_max_length = 0`)
--
-- Idempotent: run it, restart PostgreSQL, run it again.
--   dev  (native cluster)  sudo -u postgres psql -d clx -f deploy/postgres/observability.sql
--   prod (container)       docker exec -i clx-postgres psql -U clxadmin -d clx \
--                            -v ON_ERROR_STOP=1 < deploy/postgres/observability.sql
--
-- psql-only on purpose: the merge of shared_preload_libraries and the
-- "restart done?" branch use psql meta-commands (`\gset`, `\if`), because
-- ALTER SYSTEM is not allowed inside a function/DO block.
--
-- Run 1 writes postgresql.auto.conf and reports that a restart is required.
-- Run 2 creates the extension. Logs land in <PGDATA>/log (inside the volume on
-- production), bounded to one file per weekday. Full runbook: README.md.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Preload the libraries, preserving whatever is already configured.
--    NEVER overwrite shared_preload_libraries wholesale: production also
--    preloads auth_delay for the login delay (#122).
--
--    The value must be a bare comma-separated list. Quoting it as one string
--    (`= 'a,b'`) makes ALTER SYSTEM store `"a,b"` as a SINGLE library name,
--    and PostgreSQL then refuses to start with
--    `could not access file "a,b"`. Hence format() + \gexec, not :'var'.
-- ---------------------------------------------------------------------------
SELECT format('ALTER SYSTEM SET shared_preload_libraries = %s',
              string_agg(DISTINCT lib, ', ' ORDER BY lib)) AS stmt
FROM (
  SELECT btrim(lib) AS lib
  FROM unnest(regexp_split_to_array(
         current_setting('shared_preload_libraries'), '\s*,\s*')) AS lib
  WHERE btrim(lib) <> ''
  UNION
  SELECT unnest(ARRAY['pg_stat_statements', 'auto_explain'])
) all_libs
\gexec

-- Pending value as written to postgresql.auto.conf (applied = f until restart).
SELECT name, setting, applied
FROM pg_file_settings
WHERE name = 'shared_preload_libraries';

-- ---------------------------------------------------------------------------
-- 2. Core settings. These work before the restart; extension GUCs do not
--    exist until the library is loaded, so they are set in step 5.
-- ---------------------------------------------------------------------------

-- Cost accounting needs real I/O timing, otherwise blk_read_time stays 0 and
-- an index that only saves cache hits looks harmless.
ALTER SYSTEM SET track_io_timing = on;

-- ---------------------------------------------------------------------------
-- 3. Slow-query evidence. Thresholds are the only thing to tune here.
-- ---------------------------------------------------------------------------
ALTER SYSTEM SET log_min_duration_statement = '2s';
ALTER SYSTEM SET log_statement              = 'none';  -- never; see header
ALTER SYSTEM SET log_lock_waits             = on;
ALTER SYSTEM SET log_temp_files             = '10MB';

-- Bind parameters stay out of the log: the SQL page and the R clients send
-- research values, not just placeholders.
ALTER SYSTEM SET log_parameter_max_length          = 0;
ALTER SYSTEM SET log_parameter_max_length_on_error = 0;

-- ---------------------------------------------------------------------------
-- 4. Keep the logs on the machine, bounded. `log` is relative to PGDATA, so on
--    production it lives inside the volume and survives a container restart.
--    One file per weekday + truncate = never more than seven files.
-- ---------------------------------------------------------------------------
ALTER SYSTEM SET logging_collector        = on;
ALTER SYSTEM SET log_directory            = 'log';
ALTER SYSTEM SET log_filename             = 'postgresql-%a.log';
ALTER SYSTEM SET log_rotation_age         = '1d';
ALTER SYSTEM SET log_rotation_size        = '128MB';
ALTER SYSTEM SET log_truncate_on_rotation = on;
ALTER SYSTEM SET log_checkpoints          = on;
-- user@database application_name remote_host - the last two make it possible
-- to attribute a query to the R client (on production the docker userland
-- proxy shows the bridge IP, see PITFALLS).
ALTER SYSTEM SET log_line_prefix = '%m [%p] %q%u@%d %a %r ';

SELECT pg_reload_conf();

-- ---------------------------------------------------------------------------
-- 5. The extension can only be created once the library is really loaded.
--    On the first run this prints the restart reminder and does nothing.
-- ---------------------------------------------------------------------------
SELECT CASE
         WHEN current_setting('shared_preload_libraries') LIKE '%pg_stat_statements%'
         THEN 'true' ELSE 'false'
       END AS pgss_loaded
\gset

\if :pgss_loaded
  -- Extension GUCs only exist once the library is loaded; setting them before
  -- the restart fails with "unrecognized configuration parameter".
  -- `pg_stat_statements.max` (default 5000 shapes) is deliberately left alone:
  -- it is a postmaster setting, so it would only ever take effect one restart
  -- later - not worth the extra knob.
  ALTER SYSTEM SET pg_stat_statements.track         = 'all';  -- incl. nested statements
  ALTER SYSTEM SET pg_stat_statements.track_utility = on;

  ALTER SYSTEM SET auto_explain.log_min_duration = '500ms';
  ALTER SYSTEM SET auto_explain.log_analyze      = on;
  ALTER SYSTEM SET auto_explain.log_buffers      = on;
  ALTER SYSTEM SET auto_explain.log_timing       = on;
  ALTER SYSTEM SET auto_explain.log_wal          = off;
  ALTER SYSTEM SET auto_explain.log_verbose      = off;
  ALTER SYSTEM SET auto_explain.log_settings     = off;

  SELECT pg_reload_conf();

  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

  -- The extension grants SELECT to PUBLIC (pg_stat_statements--1.10.sql).
  -- Without this REVOKE the published clx_readonly password could read the
  -- query text of every role, including the auth flows.
  REVOKE SELECT ON pg_stat_statements FROM PUBLIC;

  SELECT count(*) AS statements_tracked FROM pg_stat_statements;
\else
  \echo 'RESTART REQUIRED: shared_preload_libraries is not active yet.'
  \echo 'Restart PostgreSQL, then run this file again to create the extension.'
\endif

-- ---------------------------------------------------------------------------
-- 6. Show the effective state (some rows only change after the restart).
-- ---------------------------------------------------------------------------
SELECT name, setting, pending_restart
FROM pg_settings
WHERE name IN (
  'shared_preload_libraries',
  'pg_stat_statements.max',
  'pg_stat_statements.track',
  'track_io_timing',
  'log_min_duration_statement',
  'log_parameter_max_length',
  'auto_explain.log_min_duration',
  'logging_collector',
  'log_directory',
  'log_filename'
)
ORDER BY name;

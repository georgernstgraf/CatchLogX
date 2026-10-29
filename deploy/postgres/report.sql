-- Index-forensics report (#169). Read-only: SELECTs only.
--
-- Run against the database whose workload you want to judge:
--   dev  : sudo -u postgres psql -d clx -f deploy/postgres/report.sql
--   prod : runuser -u clxadmin -- bash -c 'psql -d clx -f deploy/postgres/report.sql'
--          (native cluster since #170; the docker path is gone)
--
-- How to read it:
--   1. `TOP STATEMENTS`      - where the time goes, per normalised shape.
--   2. `READ-ONLY ROLE`      - the same, restricted to clx_readonly (the R
--                              clients); this is the workload the research
--                              group actually generates.
--   3. `SEQUENTIAL SCANS`    - tables that are read end-to-end, and how many
--                              rows that costs per scan.
--   4. `UNUSED INDEXES`      - indexes the planner never touches (candidates
--                              for removal, not for addition).
--   5. `TEMP BLOCKS`         - sorts/hashes spilling to disk: usually a
--                              missing index or a work_mem question.
--   6. `TABLE SIZES`         - puts the numbers above into perspective.
--   7. `CONNECTIONS PER CLIENT ADDRESS` - a snapshot of who holds how many
--                              connections (#171). "5 per client address" is an
--                              observed figure, not a limit: PostgreSQL has no
--                              per-IP connection limit.
--
-- Rules of thumb for turning this into schema changes:
--   * A statement with high `total_ms` AND high `blk_read` per call on a big
--     table is an index candidate; confirm with
--     `EXPLAIN (ANALYZE, BUFFERS) <query>` before and after.
--   * `Seq Scan` on a small table (a few thousand rows) is fine - Postgres is
--     right to ignore an index there. Only large `tuples_per_scan` matter.
--   * Costs: every index slows INSERT/UPDATE and takes disk. Add the ones the
--     report proves, not the ones that look plausible.
--   * The counters are cumulative since `stats_reset` / the last PostgreSQL
--     restart. Start a clean measurement window with
--     `SELECT pg_stat_statements_reset(); SELECT pg_stat_reset();`
--     (requires a superuser; it throws the history away).

\set ON_ERROR_STOP on
\pset pager off
\pset border 2
\x auto

DO $$
BEGIN
  IF to_regclass('public.pg_stat_statements') IS NULL THEN
    RAISE EXCEPTION 'pg_stat_statements is not installed - run observability.sql and restart PostgreSQL first';
  END IF;
END
$$;

\echo ''
\echo '=== MEASUREMENT WINDOW ==='
SELECT current_database()                                                        AS database,
       COALESCE(d.stats_reset, pg_postmaster_start_time())                       AS since,
       now() - COALESCE(d.stats_reset, pg_postmaster_start_time())               AS window,
       (SELECT count(*) FROM pg_stat_statements)                                 AS tracked_shapes
FROM pg_stat_database d
WHERE d.datname = current_database();

\echo ''
\echo '=== CONNECTIONS PER CLIENT ADDRESS (snapshot, #171) ==='
-- "5 concurrent connections per client address" is the observed ceiling of the
-- read-only workload, NOT a server-side rule: PostgreSQL has no per-IP limit.
-- A `note` is only a prompt to look at the R client's pool settings, not an alarm.
SELECT coalesce(client_addr::text, 'local (socket)')            AS source,
       usename                                                   AS role,
       count(*)                                                  AS conns,
       count(*) FILTER (WHERE state <> 'idle')                   AS busy,
       CASE WHEN usename = 'clx_readonly' AND count(*) > 5
            THEN 'over the observed 5/address' ELSE '' END       AS note,
       string_agg(DISTINCT coalesce(nullif(application_name, ''), '?'), ', ')
                                                                 AS clients
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY 1, 2
ORDER BY count(*) DESC, 1;

\echo ''
\echo '=== ROLE CEILINGS vs. LIVE CONNECTIONS (rolconnlimit -1 = unlimited) ==='
SELECT r.rolname,
       r.rolconnlimit,
       (SELECT count(*) FROM pg_stat_activity a WHERE a.usesysid = r.oid)  AS live
FROM pg_roles r
WHERE r.rolcanlogin
ORDER BY r.rolconnlimit DESC, r.rolname;

\echo ''
\echo '=== TOP STATEMENTS BY TOTAL TIME (top-level, all roles) ==='
SELECT r.rolname                                              AS role,
       s.calls,
       round(s.total_exec_time::numeric, 1)                   AS total_ms,
       round(s.mean_exec_time::numeric, 2)                    AS mean_ms,
       round(s.max_exec_time::numeric, 1)                     AS max_ms,
       s.rows,
       round((100.0 * s.shared_blks_hit
              / NULLIF(s.shared_blks_hit + s.shared_blks_read, 0))::numeric, 1)
                                                              AS cache_hit_pct,
       s.shared_blks_read                                     AS blk_read,
       s.temp_blks_written                                    AS temp_blk_written,
       left(regexp_replace(s.query, '\s+', ' ', 'g'), 180)    AS query
FROM pg_stat_statements s
JOIN pg_roles r ON r.oid = s.userid
WHERE s.toplevel
ORDER BY s.total_exec_time DESC
LIMIT 25;

\echo ''
\echo '=== READ-ONLY ROLE: clx_readonly (the R workload) ==='
SELECT s.calls,
       round(s.total_exec_time::numeric, 1)                   AS total_ms,
       round(s.mean_exec_time::numeric, 2)                    AS mean_ms,
       round(s.max_exec_time::numeric, 1)                     AS max_ms,
       s.rows,
       s.shared_blks_read                                     AS blk_read,
       round(s.blk_read_time::numeric, 1)                     AS read_ms,
       s.temp_blks_written                                    AS temp_blk_written,
       left(regexp_replace(s.query, '\s+', ' ', 'g'), 200)    AS query
FROM pg_stat_statements s
JOIN pg_roles r ON r.oid = s.userid
WHERE r.rolname = 'clx_readonly'
ORDER BY s.total_exec_time DESC
LIMIT 20;

\echo ''
\echo '=== SLOWEST SHAPES PER CALL (>= 50 calls, all roles) ==='
SELECT r.rolname                                              AS role,
       s.calls,
       round(s.mean_exec_time::numeric, 1)                    AS mean_ms,
       round(s.max_exec_time::numeric, 1)                     AS max_ms,
       s.rows,
       left(regexp_replace(s.query, '\s+', ' ', 'g'), 180)    AS query
FROM pg_stat_statements s
JOIN pg_roles r ON r.oid = s.userid
WHERE s.calls >= 50
ORDER BY s.mean_exec_time DESC
LIMIT 15;

\echo ''
\echo '=== SEQUENTIAL SCANS (cumulative since stats_reset) ==='
SELECT relname,
       seq_scan,
       seq_tup_read,
       round(seq_tup_read::numeric / GREATEST(seq_scan, 1), 0) AS tuples_per_scan,
       idx_scan,
       n_live_tup,
       pg_size_pretty(pg_total_relation_size(relid))           AS total_size
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 25;

\echo ''
\echo '=== INDEX USE PER TABLE (seq vs. index) ==='
SELECT relname,
       n_live_tup,
       seq_scan,
       idx_scan,
       round(100.0 * idx_scan / NULLIF(seq_scan + idx_scan, 0), 1) AS idx_scan_pct,
       pg_size_pretty(pg_total_relation_size(relid))               AS total_size
FROM pg_stat_user_tables
WHERE n_live_tup > 0
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;

\echo ''
\echo '=== UNUSED INDEXES (idx_scan = 0 since stats_reset) ==='
SELECT s.relname                                             AS table_name,
       s.indexrelname                                        AS index_name,
       pg_size_pretty(pg_relation_size(s.indexrelid))        AS index_size,
       i.indisunique,
       i.indisprimary
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
ORDER BY pg_relation_size(s.indexrelid) DESC;

\echo ''
\echo '=== STATEMENTS THAT SPILL TO DISK (temp blocks) ==='
SELECT r.rolname                                              AS role,
       s.calls,
       s.temp_blks_written                                    AS temp_blk_written,
       round(s.temp_blk_write_time::numeric, 1)               AS temp_write_ms,
       s.rows,
       left(regexp_replace(s.query, '\s+', ' ', 'g'), 180)    AS query
FROM pg_stat_statements s
JOIN pg_roles r ON r.oid = s.userid
WHERE s.temp_blks_written > 0
ORDER BY s.temp_blks_written DESC
LIMIT 15;

\echo ''
\echo '=== TABLE SIZES ==='
SELECT relname,
       n_live_tup,
       n_dead_tup,
       pg_size_pretty(pg_relation_size(relid))        AS heap_size,
       pg_size_pretty(pg_indexes_size(relid))         AS index_size,
       pg_size_pretty(pg_total_relation_size(relid))  AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

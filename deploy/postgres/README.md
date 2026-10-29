# PostgreSQL query observability (index forensics, #169)

Configuration and runbook for the question **"which indexes does the real
workload need?"** — answered from measured statements and plans instead of
guesswork.

Two modes and two roles are involved:

| Instance | How it runs | How to apply |
|---|---|---|
| Dev VPS (`claw.graf.priv.at`) | native cluster `postgresql@16-main`, config in `/etc/postgresql/16/main/` | `sudo -u postgres psql -d clx -f deploy/postgres/observability.sql` |
| Production (BOKU) | native cluster `postgresql@16-main` since #170, settings in `/etc/postgresql/16/main/conf.d/99-catchlogx.conf` | already configured at cluster creation; only the extension part is run once: `deploy/prod/postgres/observability-extension.sql` |

## What gets collected — and what deliberately does not

| Mechanism | Purpose |
|---|---|
| `pg_stat_statements` | one row per **normalised** query shape (constants become `$1`): `calls`, `total_exec_time`, `mean_exec_time`, `rows`, `shared_blks_hit/read`, `temp_blks_written`, `userid` |
| `auto_explain` (≥ 500 ms) | the **real plan with BUFFERS** of slow statements; this is what proves *where* the time goes (`Seq Scan on fish_catches`, bad row estimates, …) |
| `log_min_duration_statement` (≥ 2 s) | safety net for statements auto_explain does not cover, **without bind parameters** |
| `logging_collector` | logs inside `PGDATA/log`, one file per weekday, ≤ 128 MB each, truncated on rotation (bounded, survives restarts) |

**Not collected on purpose:** `log_statement = 'all'`. It would write every
statement including literals — i.e. research data from the R clients and the
SQL page — into a log file, and raw text cannot be aggregated per query shape.
`log_parameter_max_length = 0` additionally keeps bind parameters out of the
slow-query log.

`pg_stat_statements` grants `SELECT` to `PUBLIC` when the extension is created.
`observability.sql` revokes that: the published `clx_readonly` password must
not be able to read the query text of other roles (the auth flows run as the
app role). The app role is a superuser today (#166), so it keeps access.

## Applying it

The script is idempotent and must run **twice around a restart**, because
`shared_preload_libraries` (and `logging_collector`) are postmaster settings:

```bash
# 1st run: writes postgresql.auto.conf, prints "restart required"
# 2nd run: creates the extension and revokes PUBLIC
```

The script merges into the existing `shared_preload_libraries` instead of
overwriting it, because production also preloads `auth_delay` (#122).

### Dev (native cluster, 127.0.0.1:5432)

```bash
cd ~/repos/georgernstgraf/CatchLogX
sudo -u postgres psql -d clx -f deploy/postgres/observability.sql
sudo systemctl restart postgresql@16-main      # ~1 s, the app reconnects
sudo -u postgres psql -d clx -f deploy/postgres/observability.sql
sudo -u postgres psql -d clx -f deploy/postgres/report.sql
```

Logs: `/var/lib/postgresql/16/main/log/postgresql-<day>.log`.

### Production (native cluster since #170)

The settings are part of the cluster configuration
(`/etc/postgresql/16/main/conf.d/99-catchlogx.conf`, versioned in
`deploy/prod/postgres/`), so they are applied **before the first start** — no
two-pass `ALTER SYSTEM`, no restart dance. What is left is the extension part,
which needs the preloaded library:

```bash
cd /root/CatchLogX
runuser -u clxadmin -- psql -d clx -f deploy/prod/postgres/observability-extension.sql
```

Logs:

```bash
ls -lh /var/lib/postgresql/16/main/log/
tail -n 200 /var/lib/postgresql/16/main/log/postgresql-$(date +%a).log
```

`logging_collector` is on: connection/statement lines are **not** in
`journalctl`, they are in the files above. `%r` shows the real client address
(the app is loopback by design).

## Reading the result

`report.sql` prints, in this order: measurement window, top statements by total
time, the same restricted to `clx_readonly`, slowest shapes per call,
sequential scans, index use per table, unused indexes, temp-file spills and
table sizes.

On production it is run **on the machine** (there is no dispatch job any more);
the full output contains query texts and therefore stays there, in
`~/catchlogx-reports/`:

```bash
cd /root/CatchLogX
runuser -u clxadmin -- bash -c 'psql -d clx -f deploy/postgres/report.sql' \
  > "/home/clxadmin/catchlogx-reports/observability-$(date -u +%Y%m%dT%H%M%SZ).txt"
chown clxadmin:clxadmin /home/clxadmin/catchlogx-reports/observability-*.txt
```

Only a text-free summary may leave the machine — this repository is public.

Turn evidence into a schema change like this:

1. Pick the statement with high `total_ms` **and** high `blk_read` per call in
   `TOP STATEMENTS` (or in the `clx_readonly` section).
2. Run `EXPLAIN (ANALYZE, BUFFERS) <query>` and look for a `Seq Scan` with a
   high actual row count on a large table, or a filter that removes almost
   everything.
3. Also look at the **plan** of that query in the slow-query log
   (`auto_explain` section, `duration: … plan:`) — it shows the plan the
   application really got, including the `Filter:` and `Rows Removed by Filter:`.
4. Add the index to `prisma/schema.prisma` (`@@index([...])`), create a
   migration (`npx prisma migrate dev --name add_index_…`), and compare the
   same `EXPLAIN (ANALYZE, BUFFERS)` before/after.
5. Re-check `UNUSED INDEXES` later and remove what the planner never uses.

Caveats that decide whether the numbers mean anything:

- Counters are cumulative since `stats_reset` (or the last restart). For a clean
  window run `SELECT pg_stat_statements_reset(); SELECT pg_stat_reset();` —
  superuser only, it discards the history.
- **The dev instance has ~127k rows in `fish_catches`** (the pre-#168 container
  data, migrated on 2026-10-28); production has ~465k. Dev is good enough to see
  query *shapes* and rough relative costs, but a `Seq Scan` that looks harmless
  there can still be the bottleneck at production volume — confirm the decisive
  cases on production (or a production dump in a scratch database).
- Since #170 production shows the **real client address** in `%r` (the container
  proxy masked it as `172.18.0.1`). The app's own connections are `127.0.0.1`;
  everything else is a research-group client.
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. Prisma
  wraps each migration in one, so an index on a large table needs the
  `CONCURRENTLY` variant written by hand into the migration with the
  transaction wrapper disabled; otherwise the table is locked while it builds.
- Indexes cost write throughput and disk. A `Seq Scan` on a small lookup table
  is the planner's correct choice, not a bug.

## Rolling it back

```sql
ALTER SYSTEM RESET shared_preload_libraries;   -- then restart
ALTER SYSTEM RESET pg_stat_statements.max;
ALTER SYSTEM RESET pg_stat_statements.track;
ALTER SYSTEM RESET pg_stat_statements.track_utility;
ALTER SYSTEM RESET track_io_timing;
ALTER SYSTEM RESET log_min_duration_statement;
ALTER SYSTEM RESET log_lock_waits;
ALTER SYSTEM RESET log_temp_files;
ALTER SYSTEM RESET log_parameter_max_length;
ALTER SYSTEM RESET log_parameter_max_length_on_error;
ALTER SYSTEM RESET auto_explain.log_min_duration;
ALTER SYSTEM RESET logging_collector;
ALTER SYSTEM RESET log_directory;
ALTER SYSTEM RESET log_filename;
ALTER SYSTEM RESET log_rotation_age;
ALTER SYSTEM RESET log_rotation_size;
ALTER SYSTEM RESET log_truncate_on_rotation;
ALTER SYSTEM RESET log_line_prefix;
DROP EXTENSION IF EXISTS pg_stat_statements;
SELECT pg_reload_conf();
```

Note that `ALTER SYSTEM RESET` also removes `auth_delay` if you reset
`shared_preload_libraries` wholesale — set the remaining libraries explicitly
instead of resetting that one on production.

## Files

| File | Purpose |
|---|---|
| `observability.sql` | idempotent apply: settings + extension + `REVOKE` |
| `report.sql` | read-only analysis report |
| `README.md` | this runbook |

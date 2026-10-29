# Production PostgreSQL — native cluster (#170)

Since **2026-10-30** the production database runs as a native systemd service
(`postgresql@16-main`, PGDG 16) on the BOKU host, not in a container. This
mirrors the dev instance (`#168`) and removes the layer that hid real client
IPs, needed `docker` for every maintenance command, and kept the configuration
inside a volume.

| | Before (container) | After (native) |
|---|---|---|
| Runtime | `clx-postgres`, `postgres:16-alpine` | `postgresql@16-main` (systemd, `start.conf = manual` until the window) |
| Data | volume `catchlogx_clx_pgdata` | `/var/lib/postgresql/16/main` |
| Config | inside the volume (`postgresql.auto.conf`) | `/etc/postgresql/16/main/{postgresql.conf,conf.d/99-catchlogx.conf,pg_hba.conf}` |
| Logs | `docker exec … tail $PGDATA/log` | `/var/lib/postgresql/16/main/log/postgresql-<day>.log` |
| Client IPs | bridge IP `172.18.0.1` | the real address (`%r`) |
| Maintenance | `docker exec` / `docker restart` | `psql`, `systemctl reload\|restart postgresql@16-main` |
| Access | loopback `trust`, external `scram` | socket `peer` (clxadmin/postgres), TCP `scram-sha-256`, TLS offered |
| Rollback | — | container kept: `restart=no`, stopped, volume intact |

Node details: Ubuntu 26.04 ships PostgreSQL **18** only, so the PGDG repository
adds 16. The store is `/var/lib/postgresql/16/main`; the packaged
`postgresql.conf` keeps pointing there and includes `conf.d/`.

## Files in this directory

| File | Target on the host | Mode |
|---|---|---|
| `provision-cluster.sh` | run from the checkout (root) | – |
| `99-catchlogx.conf` | `/etc/postgresql/16/main/conf.d/99-catchlogx.conf` | `644 root:root` |
| `pg_hba.conf` | `/etc/postgresql/16/main/pg_hba.conf` | `640 postgres:postgres` |
| `make-tls-cert.sh` | run from the checkout (root) | – |
| `observability-extension.sql` | `psql -f …` as `clxadmin` | – |
| `readonly-role.sh` | run from the checkout (root) | – |

`provision-cluster.sh` is idempotent and **does not start the cluster**: the
container owns port 5432 until the maintenance window. It never drops or
re-initialises an existing `PGDATA`.

## Preparation (no downtime)

```sh
cd /root/CatchLogX && git pull            # the checkout is the runbook host
sudo ./deploy/prod/postgres/provision-cluster.sh
pg_lsclusters                            # 16 main 5432 down  16/main start.conf=manual
```

Prove the configuration boots **before** the window, on a throwaway port. Note
the two edits `provision-cluster.sh` makes to the packaged `postgresql.conf`:
Ubuntu ships `#include_dir = 'conf.d'` **commented out** (without it the whole
`99-catchlogx.conf` is silently ignored) and `pg_createcluster` picks port 5433
because the container occupies 5432 at creation time.

```sh
sudo pg_ctlcluster 16 main start -o '-p 5499'
sudo -u postgres psql -p 5499 -tAc "show shared_preload_libraries;
  show logging_collector; show ssl; show auto_explain.log_min_duration"
sudo pg_ctlcluster 16 main stop
```

This is the cheapest check of the one real risk in `99-catchlogx.conf`: the
extension GUCs (`pg_stat_statements.*`, `auto_explain.*`) are accepted at startup
because the libraries are preloaded, but a typo in
`shared_preload_libraries` makes the postmaster refuse to start.

## Maintenance window

Everything below runs as **root** over the BOKU VPN. `runuser` is used because
the server-side commands must run as `clxadmin`: peer auth maps the OS user to
the DB role, and the restored objects must belong to the app role.

### 0. Preconditions

```sh
df -h /                                   # dump is ~56 MB, cluster ~300 MB
docker ps --format '{{.Names}} {{.Status}}'   # clx-postgres up
pg_lsclusters                             # 16/main down
systemctl --user -M clxadmin@ status catchlogx.service | head -3
```

### 1. Freeze the baseline

Same SQL against the container **before** and against the cluster **after** —
the outputs must be identical (except the `clx_shadow` database, see below):

```sh
counts_sql=$(cat <<'SQL'
SELECT format('SELECT %L, count(*) FROM public.%I', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SELECT 'FileBlob.bytes', coalesce(sum(length(data)),0) FROM "FileBlob";
SELECT 'migrations', count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
SQL
)

# before (container):
docker exec -i clx-postgres psql -U clxadmin -d clx -tA -F'=' <<<"$counts_sql" | sort > /root/pre-native.counts
# after (cluster): psql -d clx -tA -F'=' <<<"$counts_sql" | sort > /root/post-native.counts
# diff /root/pre-native.counts /root/post-native.counts
```

### 2. Hand-made backup set, then stop the app and the container

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/home/clxadmin/catchlogx-backups/pre-native-$STAMP
install -d -m 700 -o clxadmin -g clxadmin "$DEST"
docker exec clx-postgres pg_dump -U clxadmin -d clx -Fc > "$DEST/db.dump"
pg_restore --list "$DEST/db.dump" > "$DEST/db.dump.list"
cp /root/pre-native.counts "$DEST/rowcounts.txt"
chown -R clxadmin:clxadmin "$DEST"
echo "$DEST"                               # record it - this is rollback path #2

# app off, container out of the way (volume stays!)
sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user stop catchlogx.service
docker update --restart=no clx-postgres
docker stop clx-postgres
```

### 3. Start the cluster, create the roles and the database, restore

The roles must exist **before** the restore: the dump contains `GRANT`s and
default privileges that reference them.

```sh
systemctl start postgresql@16-main
pg_isready

# passwords come from the env file, never from the shell history
PGPW="$(sed -n 's#^DATABASE_URL=postgresql://clxadmin:\([^@]*\)@.*#\1#p' /home/clxadmin/.config/catchlogx/.env)"
ROPW="$(sed -n 's#^READONLY_DB_PASSWORD=##p' /home/clxadmin/.config/catchlogx/.env)"
[ ${#PGPW} -eq 48 ] && [ -n "$ROPW" ] || { echo "env parse failed"; exit 1; }

printf '%s\n' '\getenv pw PG_NEW_PW' \
  "CREATE ROLE clxadmin LOGIN SUPERUSER PASSWORD :'pw';" \
  | PGPW="$PGPW" runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d postgres -f -
printf '%s\n' '\getenv pw PG_NEW_PW' \
  "CREATE ROLE clx_readonly LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 40 PASSWORD :'pw';" \
  | PGPW="$ROPW" runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d postgres -f -

# same collation as the container database (en_US.utf8) - otherwise text sort
# order changes for the research group
runuser -u postgres -- createdb -O clxadmin --encoding=UTF8 \
  --locale=en_US.UTF-8 --template=template0 clx

runuser -u clxadmin -- pg_restore -d clx --no-owner --role=clxadmin \
  < "/home/clxadmin/catchlogx-backups/pre-native-$STAMP/db.dump"
```

`clx_shadow` is **not** restored: it existed for `prisma migrate dev`, which
never runs on production. The `clxadmin` role keeps `SUPERUSER` (#166 is a
separate ticket) and the app's `DATABASE_URL` stays `127.0.0.1:5432` — nothing
in `/home/clxadmin/.config/catchlogx/.env` changes except the read-only password, which is not
rotated here.

### 4. Verify before the app comes back

```sh
counts_sql=$(…)   # from step 1
runuser -u clxadmin -- psql -d clx -tA -F'=' <<<"$counts_sql" | sort > /root/post-native.counts
diff /root/pre-native.counts /root/post-native.counts      # must be empty

runuser -u clxadmin -- psql -d clx -tAc \
  "SELECT migration_name, finished_at IS NOT NULL, rolled_back_at IS NULL FROM \"_prisma_migrations\" ORDER BY started_at"
# -> the same rows as prisma/migrations/ in the deployed commit, nothing half-applied
```

`prisma migrate deploy` itself runs on the next production deploy (the checkout
has no `node_modules`); it will report "No pending migrations". The bookkeeping
table above is the equivalent proof at this point.

### 5. Query observability (#169), now native

```sh
cd /root/CatchLogX
runuser -u clxadmin -- psql -d clx -f deploy/prod/postgres/observability-extension.sql
# expect: pg_stat_statements loaded, extension present, PUBLIC revoked
```

### 6. Start the app and run the smoke test

```sh
sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user start catchlogx.service
for i in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3001/ && break; sleep 2; done
curl -sS -o /dev/null -w '%{http_code}\n' http://141.244.222.191/          # nginx -> app
```

Browser smoke: sign in, open a fish list, download a file, run a query in the
SQL page. Then confirm the app's connections come from `127.0.0.1`, not a
bridge:

```sh
runuser -u clxadmin -- psql -d clx -tAc \
  "SELECT coalesce(client_addr::text,'local') AS src, usename, count(*)
   FROM pg_stat_activity GROUP BY 1,2 ORDER BY 1"
```

### 7. Backup on the new path

```sh
cd /root/CatchLogX
install -m 755 deploy/prod/backup/backup.sh /usr/local/bin/catchlogx-backup
install -m 644 deploy/prod/backup/catchlogx-backup.service \
             deploy/prod/backup/catchlogx-backup-probe.service \
             deploy/prod/backup/catchlogx-alert@.service /etc/systemd/system/
systemctl daemon-reload
systemctl start catchlogx-backup.service          # real run, dumps + mirrors off-site
systemctl start catchlogx-backup-probe.service    # restores the newest set into clx_restore_probe
journalctl -u catchlogx-backup -n 40 --no-pager
/usr/local/bin/catchlogx-backup status
```

The units no longer depend on `docker.service`; they need `clxadmin` (peer
auth) and `postgresql@16-main`.

### 8. Read-only role: verify, then prove rotation

```sh
cd /root/CatchLogX
KEEP_PASSWORD=1 ./deploy/prod/postgres/readonly-role.sh
```

This keeps the existing password (no coordination with the research group) and
verifies the real path: TCP against `141.244.222.191`, TLS required, wrong
password rejected, reads allowed, `Session`/`User`/`PasswordResets` and DDL
denied. The same script with `KEEP_PASSWORD=0` rotates the password later.

Prove the rotating mode **without** touching the shared password:

```sh
ROLE=clx_readonly_selftest ENV_FILE=/tmp/selftest.env \
  ./deploy/prod/postgres/readonly-role.sh
runuser -u clxadmin -- psql -d clx -c 'DROP OWNED BY clx_readonly_selftest'
runuser -u clxadmin -- psql -d clx -c 'DROP ROLE clx_readonly_selftest'
rm -f /tmp/selftest.env
```

### 9. Make it boot-fixed, start the measurement window

```sh
# The cluster was created with start.conf = manual so it could not race the
# container for port 5432. Now it must come up at boot without a login.
printf '# auto | manual | disabled\nauto\n' > /etc/postgresql/16/main/start.conf
pg_lsclusters                     # 16 main 5432 online postgres ...
# `systemctl is-enabled postgresql@16-main` may say `enabled-runtime` - that is
# the postgresql-generator, not a defect.

runuser -u clxadmin -- psql -d clx -c \
  'SELECT pg_stat_statements_reset(); SELECT pg_stat_reset();'
mkdir -p /home/clxadmin/catchlogx-reports && chown clxadmin:clxadmin /home/clxadmin/catchlogx-reports
```

After a few days of real workload, pull the report (query texts stay on the
machine):

```sh
cd /root/CatchLogX
runuser -u clxadmin -- bash -c \
  'psql -d clx -f deploy/postgres/report.sql' \
  > "/home/clxadmin/catchlogx-reports/observability-$(date -u +%Y%m%dT%H%M%SZ).txt"
chown clxadmin:clxadmin /home/clxadmin/catchlogx-reports/observability-*.txt
```

## Rollback

The container is **stopped, not removed** (`restart=no`), volume
`catchlogx_clx_pgdata` intact; the `pre-native-<stamp>` set is the second
safety net. The rollback returns to exactly the state before the window:

```sh
sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user stop catchlogx.service
systemctl stop postgresql@16-main
docker start clx-postgres
# Prisma reconnects on its own; restart the app and check the health endpoint
sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000 \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  systemctl --user start catchlogx.service
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/
```

While both exist, **never** run both at once: the cluster and the container
both want `5432`. `start.conf = manual` keeps the cluster from coming up at
boot, so a reboot while the rollback is active starts only the container.

Delete the volume only after weeks of green backups and at least one monthly
restore probe on the native path (same rule as the dev container, #168).

## For the research group — connecting

Nothing about the connection changed except that it can now be encrypted:

| | |
|---|---|
| host | `141.244.222.191` |
| port | `5432` |
| database | `clx` |
| role | `clx_readonly` |
| password | from the app (data-access page, #153) or out of band |
| TLS | offered; `sslmode=prefer` (libpq default) encrypts automatically, `sslmode=require` enforces it |
| limits | `CONNECTION LIMIT 40`, `SELECT` on all tables except `User`, `Session`, `PasswordResets`; no writes, no DDL |

```sh
# psql
psql "host=141.244.222.191 port=5432 dbname=clx user=clx_readonly sslmode=require"
```

```r
# R (RPostgres passes these straight to libpq; sslmode defaults to "prefer")
library(DBI)
con <- dbConnect(RPostgres::Postgres(),
                 host = "141.244.222.191", port = 5432,
                 dbname = "clx", user = "clx_readonly",
                 password = rstudioapi::askForPassword("clx_readonly"))
dbGetQuery(con, "SELECT count(*) FROM fish_catches")
```

```text
# DBeaver / any JDBC client
jdbc:postgresql://141.244.222.191:5432/clx?sslmode=require
```

```
# ~/.pgpass line (chmod 600) - host:port:db:user:password
141.244.222.191:5432:clx:clx_readonly:<password>
```

Two things that cause most support questions:

- **Physical table names are not the model names.** `FishCatch` → `fish_catches`,
  `Sampling` → `samplings`, `RiverSite` → `river_sites`, `FishSpecies` →
  `fish_species` (`@@map` in `prisma/schema.prisma`). `SELECT … FROM "FishCatch"`
  fails.
- **The certificate is self-signed** (no CA in the BOKUnet). `sslmode=require`
  encrypts without verifying; `verify-full` will fail by design. That is a
  deliberate trade: the data is internal, not secret, and the boundary is the
  role (#152, 2026-10-27 decision).

A DNS name for the host (e.g. `catchlogx.boku.ac.at`) would remove the IP from
every client config and make a real certificate possible later — that is a
request to BOKU-IT, tracked in `HANDOFF.md`.

## Logs and settings

```sh
ls -lh /var/lib/postgresql/16/main/log/
tail -n 200 /var/lib/postgresql/16/main/log/postgresql-$(date +%a).log
systemctl reload postgresql@16-main       # config changes except postmaster settings
systemctl restart postgresql@16-main      # listen_addresses, shared_preload_libraries, ssl, logging_collector
runuser -u clxadmin -- psql -d clx -c 'SHOW shared_preload_libraries'
```

`logging_collector` is on: connection and slow-query lines are **not** in
`journalctl`, they are in the files above. `%r` in the log prefix now shows the
real client address for the research group (the app is loopback by design).

## Aftercare

- `docs/ai/STATE.md`, `DECISIONS.md`, `PITFALLS.md`, `HANDOFF.md`, `ARCHITECTURE.md`
- `deploy/prod/README.md` (topology table, "Not managed here")
- `deploy/postgres/README.md` (the apply path is no longer a dispatch job)
- `.github/workflows/production-maintenance.yml` is retired; recurring
  operations are the scripts in this directory plus `deploy/postgres/report.sql`.

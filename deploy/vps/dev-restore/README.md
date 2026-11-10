# Dev re-seed on `claw` (#188)

`catchlogx-dev-restore.sh` wipes the dev database `clx` and restores the newest
production backup into it. It is a **manual tool** — there is no timer. The dev
instance works on real production data after a run; student experiments from
before the run are gone (that is the point).

| Path | Owner | Purpose |
|---|---|---|
| `/home/catchlogx/catchlogx-dev-restore.sh` | `catchlogx` | the script |
| `/home/catchlogx/backups/` | `catchlogx` | the archives it reads (`*.tar.zst` + `.sha256`) |
| `~/.local/state/catchlogx-dev-restore/last-restored` | `catchlogx` | which archive was applied last |
| `~/tools/prisma-cli/` | `catchlogx` | pinned Prisma CLI for the migration step |

## Usage

```sh
# as catchlogx on claw
~/catchlogx-dev-restore.sh                 # newest archive, skip if already applied
~/catchlogx-dev-restore.sh --force         # apply the newest archive again
~/catchlogx-dev-restore.sh 20261110T023150Z.tar.zst   # a specific archive
```

The run takes roughly a minute: unpack, dump import (~30 s), migration, app
restart, health check. Output goes to stderr, one line per step.

## What it does

1. Picks the newest `~/backups/*.tar.zst` (or the one given) and compares it
   with `last-restored`; `--force` overrides the skip.
2. `flock` against a second instance, then verifies the archive against its
   `.sha256` **before** touching the database.
3. Unpacks into `/var/tmp` (removed on exit); `env.age` is ignored, dev keeps
   its own `.env`.
4. Stops `catchlogx.service` (user unit).
5. Renames `clx` → `clx_prev`, creates a fresh `clx` (owner `clxadmin`,
   `UTF8`/`C.UTF-8`, matching the previous cluster settings) and runs
   `pg_restore --no-owner --no-privileges --role=clxadmin` as `postgres`.
6. Compares every count in `rowcounts.txt` (including the `FileBlob` byte sum)
   with the restored database.
7. Applies the migrations of the **running release**
   (`~current/prisma/schema.prisma`): dev is usually ahead of production, so
   the production schema alone would be missing e.g. `QueryLog` and the SQL
   page would answer 500 (#121).
8. Restores the `clx_readonly` whitelist (`USAGE` on `public`, `SELECT` on
   `fish_catches`, `samplings`, `river_sites`, `fish_species`).
9. Starts the app, polls `127.0.0.1:40873` for 30 s, and only then drops
   `clx_prev` and writes `last-restored`.

Any failure before step 9 leaves `clx_prev` in place and starts the app again
(the exit trap). The way back is:

```sh
psql -d postgres \
  -c 'DROP DATABASE IF EXISTS clx WITH (FORCE)' \
  -c 'ALTER DATABASE clx_prev RENAME TO clx'
systemctl --user start catchlogx.service
```

## Prerequisites

- Plaintext archives from #192 (`catchlogx-backup` on the BOKU host). Before
  that change the archives were `*.tar.zst.age` and cannot be used here.
- The OS user `catchlogx` authenticates to PostgreSQL as the **DB role
  `catchlogx`**, created once as a superuser:

  ```sh
  sudo -u postgres psql -d postgres -c 'CREATE ROLE catchlogx LOGIN SUPERUSER'
  ```

  and mapped by `local all catchlogx peer` in `/etc/postgresql/16/main/pg_hba.conf`
  (the default `local all all scram-sha-256` would ask for a password). After
  the change: `systemctl reload postgresql@16-main`.
  **No OS sudo is needed** — the app user has no root rights on this host, only
  database superuser on the dev instance. The script checks both at start.
- The Prisma CLI is not part of the standalone release. Install it once, pinned
  to the version in `package-lock.json`:
  ```sh
  npm i --prefix ~/tools/prisma-cli prisma@6.10.1
  ```
  Bump it when the repo bumps the major.

## Known limits

- **Manual**: nothing runs by itself. Add a `~/.config/systemd/user/*.timer` if
  that ever changes — the script is timer-safe (`flock`, skip-if-applied).
- No alerting on this host; a failure is a non-zero exit and a log line.
- The restore brings production **data**, not the production schema: step 7
  migrates forward to whatever `dev` is deployed. A release with a migration
  that cannot run against the production data will fail here (loudly, with
  `clx_prev` intact).

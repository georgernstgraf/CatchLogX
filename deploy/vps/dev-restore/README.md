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
  that cannot run against the production data will fail here (`clx_prev` intact,
  the app **left stopped**, not restarted against a database it cannot serve).
- **That failure is current (2026-11-15, #210).** Since #202 the release carries
  `Sampling.importId NOT NULL`, which `prisma migrate deploy` cannot add while
  the restored database holds 10 497 samplings (`23502`, Prisma `P3018`; every
  later attempt answers `P3009` until `prisma migrate resolve --rolled-back
  20261114230855_imports_model`). Until the production cutover (#200), a re-seed
  needs the **wipe route** in `deploy/prod/cutover/README.md` (§1 +
  "Phase 1c"): restore, then `TRUNCATE TABLE fish_catches, samplings,
  river_sites RESTART IDENTITY`, drop the `Uploads` rows/blobs, reload
  `fish_species` from `assets/species.json`, then migrate. That sequence was
  rehearsed on dev on 2026-11-15 and is what Phase 2 will do on production.

# Dev copy for your own machine (#235)

`export-dev-copy.sh` turns a production backup into a **sanitised dump** that
developers restore locally — no SSH to `claw`, no production credentials. It is
published as a release asset `dev-copy-<stamp>` in the **private data repo**
`georgernstgraf/CatchLogX-Data` (not in its Git tree: ~19 MB per copy, and the
data repo deliberately has no Git LFS).

## What is in the copy

| Table | Content |
|---|---|
| `fish_catches`, `samplings`, `river_sites`, `fish_species`, `Imports`, `FileBlob` (Excel originals), `TemplateFiles`, `UserQueries`, `QueryLog`, `_prisma_migrations` | complete |
| `User` | all rows (names, roles, e-mails, `isFirstLogin`), but **every `hashedPassword` is the dev password** |
| `Session`, `PasswordResets` | **structure only, no rows** — live tokens never leave production |

- **Dev password for every user: `catchlogx-dev`.** It is documented on
  purpose and protects nothing; it only lets you log in as any role. The bcrypt
  hash lives in `export-dev-copy.sh` (`DEV_PASSWORD_HASH`) — change both together.
- The `pg_stat_statements` extension (production monitoring) is dropped from the
  copy. Ownership and grants are stripped (`--no-owner --no-privileges`).
- `<stamp>` is the stamp of the production backup the copy was made from.
  `dev-copy-<stamp>.rowcounts.txt` holds the expected row counts of the copy.

## Restore (on your machine)

```sh
gh release download dev-copy-<stamp> -R georgernstgraf/CatchLogX-Data
sha256sum -c dev-copy-<stamp>.dump.zst.sha256 && zstd -d dev-copy-<stamp>.dump.zst
createdb clx && pg_restore -d clx --no-owner --no-privileges dev-copy-<stamp>.dump
```

With the Docker Compose database (no local `psql` tools needed):

```sh
docker exec clx-postgres createdb -U clxadmin clx_copy
docker exec -i clx-postgres pg_restore -U clxadmin -d clx_copy --no-owner --no-privileges < dev-copy-<stamp>.dump
```

Then bring the schema to your checkout and start the app:

```sh
npx prisma migrate deploy   # with DATABASE_URL pointing at the restored DB
npm run dev                 # log in with any username + `catchlogx-dev`
```

Do **not** run `npm run db:init` / `seed:demo` on the copy — it already holds
data (the seed guard refuses anyway).

**Secrets are not in the dump — set them yourself** in `.env`:

- `DATABASE_URL` (and `SHADOW_DATABASE_URL` for `prisma migrate dev`)
- `NEXTAUTH_SECRET` — your own random value
- `READONLY_DB_PASSWORD` / `QUERY_DATABASE_URL` only for the SQL page
  (`npm run db:readonly-role` creates `clx_readonly` locally)
- `NODEMAILER_*` only if you need mails (password reset)

## Producing a copy (on `claw`, as `catchlogx`)

```sh
~/export-dev-copy.sh                  # newest ~/backups/*.tar.zst -> ~/dev-copy/
~/export-dev-copy.sh --release        # ... and publish it (needs `gh auth login`)
~/export-dev-copy.sh --force <archiv> # rebuild a specific archive
```

1. Verifies the archive against its `.sha256`, unpacks it into `/var/tmp`.
2. Restores `db.dump` into the **scratch database `clx_devcopy`** — the live dev
   database `clx` and `catchlogx.service` are never touched.
3. Compares every count in `rowcounts.txt` (incl. the `FileBlob` byte sum).
4. Sanitises in one transaction (empties `Session`/`PasswordResets`, sets every
   password hash, drops `pg_stat_statements`) and checks the result.
5. `pg_dump -Fc`, `zstd -19`, writes `dev-copy-<stamp>.dump.zst`,
   `.rowcounts.txt` and a `.sha256` over both into `~/dev-copy/`; drops the
   scratch database (also on failure, via the exit trap).
6. With `--release`: `gh release create dev-copy-<stamp>` in the data repo,
   skipped when the release already exists.

Idempotent: a second run for the same archive skips the build as long as the
existing files still match their checksum. If `gh` is not available on `claw`,
run without `--release`, copy the three files off the host and create the
release from a machine with `gh` (the script prints the command).

**Refresh:** manually, once a month after the backup probe. After the end of the
project (diploma thesis, ~June) no new copies are made; the last release
stays as reference.

Requirements are the same as for the re-seed above (DB role `catchlogx` with
`CREATEDB` or superuser via peer auth), plus `zstd` and the PostgreSQL 16 client
tools.

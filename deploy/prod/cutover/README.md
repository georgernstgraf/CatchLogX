# Production cutover — rebuild the database from the `-data` files (#200)

**Status (2026-11-15).** Phase 0 (blob archive) and **Phase 1a (dev dry run,
9 of 13 files)** are run and green; the numbers below are measured, not
computed. **Phase 1c (Route C: wipe instead of an empty database)** was
rehearsed on the same day and is what Phase 2 uses — the production database is
wiped in place, so users, templates and saved queries survive. Phase 1b (all 13
files) waits on the Excel repair (`CatchLogX-Data#7`); Phase 2 is still
**TODO (#204)** and is filled in from what Phase 1 proves.

## Decision

The production database is **rebuilt, not migrated**: `prisma migrate deploy`
onto an empty database, then a **pure file import** from `CatchLogX-Data` with
**every validation active**. There is no special path and no bypass — the
cutover is the first real user of the upload/import pipeline.

Consequences:

- The migration path from #184 (`Uploads` → `LegacyUploads`, nullable
  `importId`, backfill) is **dropped**. The new database knows one state only:
  every data row has a provenance by construction (`Sampling.importId NOT NULL`).
- **ids are renumbered** (`samplings.id`, `fish_catches.id`, `river_sites.id`).
  `fish_species.id` stays stable (JSON master `assets/species.json`). The
  research group joins on content, not on ids.
- The old database is kept as a dump for rollback and for the comparison in
  `docs/ai/STATE.md`.

Supersedes P4/P5 of #198 and the migration path of #184.

## Scope — the import list

**In the window — 13 files, 183 855 rows** (import order = file name order):

| # | File | Rows |
|---|---|---:|
| 1 | `2026_A_valid_final.xlsx` | 1 939 |
| 2 | `2026_B_valid_final.xlsx` | 13 454 |
| 3 | `2026_D_valid_final_DaniohnePIT.xlsx` | 9 655 |
| 4 | `2026_E_F_valid_final.xlsx` | 11 593 |
| 5 | `2026_G_valid_final.xlsx` | 7 304 |
| 6 | `2026_I_valid_final.xlsx` | 5 243 |
| 7 | `2026_K_valid_final.xlsx` | 15 492 |
| 8 | `2026_L_valid_final.xlsx` | 3 162 |
| 9 | `2026_N_O_P_valid_final.xlsx` | 26 980 |
| 10 | `2026_R_valid_final.xlsx` | 1 914 |
| 11 | `2026_S_valid_final.xlsx` | 28 770 |
| 12 | `2026_T_valid_final.xlsx` | 35 413 |
| 13 | `2026_W_Y_Z_valid_final.xlsx` | 22 936 |
| | **total** | **183 855** |

**After the window, as regular uploads** (the new database has a real import path
with provenance, so neither needs a cutover special case):

| What | Rows | Why not in the window |
|---|---:|---|
| `2026_M_final.xlsx` | 63 385 | 1 638 rows without `site_name`; repaired with Lena first (#206) |
| the June-23 delivery (one of the three variants) | 46 216 (45 380 distinct) | own delivery, not in the 13 files; see "Open decisions" |

The June-23 file has 836 rows that share all compared columns with another row
in the same file. The import path does not deduplicate — those rows land twice.

**Not imported, and why:**

| What | Rows | Why |
|---|---:|---|
| `2026-06-18_upload_1781790617525.xlsx` | 11 593 | content-identical to `2026_E_F` (full-row fingerprint 100 % both ways) |
| `2026-06-19_upload_1781868482406.xlsx` | 28 770 | content-identical to `2026_S` (28 769 of 28 770 rows) |
| the other two June-23 variants | 46 216 each | same 45 380 distinct rows as the third variant; only whitespace in species names differs |
| the 13 June uploads of the files above | — | byte-identical to the delivery files (`CatchLogX-Data#6`); they are archived as upload objects, not as deliveries |

Production holds 464 654 catches, the archive 426 251. **The difference is not
explained by a row-count subtraction**: `178 011` is the *file* row count of the
five legacy files, and those were `DB_ERROR` partial imports, not complete
imports. What is established instead (sha256, `CatchLogX-Data#6`, 2026-11-14):

- 13 of the 18 production uploads are **byte-identical** to files in the repo —
  12 under `should_work/` plus `2026_M_final.xlsx`. `2026_S_valid_final.xlsx` was
  never uploaded.
- The other 5 are the legacy folder: two are content-identical to `2026_E_F` and
  `2026_S` (verified row by row, 2026-11-14), and three are variants of one
  delivery that is **not** in the 13-file set — see "Open decisions".


### Validation state of the 13 cutover files (2026-11-14)

- **Structure:** all green. (`2026_M_final.xlsx` fails with 1 638 rows without
  `site_name`; it is not part of the window and comes back as a regular upload.)
- **Species:** 6 distinct strings do not match the 165 master entries. Three
  are pure normalisation (NBSP in 171 rows, `(hybrid)` suffix in 2) and are
  caught by `normalizeSpeciesName`; two need an Excel repair now (18 rows in
  4 files, `CatchLogX-Data#7`). The third (`Leuciscus aspius hyb`) only occurs
  in the M file and is normalised to `Leuciscus aspius hybrid`.
- **PIT:** no duplicate `pit_dec` within any file, in none of the 19 files.

## Phase 0 — archive completeness (read-only) — #203

Nothing may be deleted before every original file exists in `CatchLogX-Data`.

`deploy/prod/cutover/export-upload-blobs.sh` does the three steps. It only ever
issues `SELECT`s, inside a read-only transaction (`default_transaction_read_only=on`):

```bash
./export-upload-blobs.sh inventory   # → ~/blob-export/inventory.tsv, 18 rows
./export-upload-blobs.sh compare     # prod sha256 → path in CatchLogX-Data
./export-upload-blobs.sh export --all # fetch all 18, verify sha256
```

**Decision (2026-11-14): all 18 upload objects are archived as files**, not just
the unmatched ones — duplicates included. After the cutover the old database is
gone, and the upload objects (with the names the client gave them, their state
and timestamp) are the only record of what was actually uploaded. The 13 that
are byte-identical to a delivery are kept as `legacy-uploads-2026-06/` entries
next to the five that are unique; the manifest in that folder maps each upload
to the delivery file with the same sha256.

Set `PROD_DSN='postgresql://clxadmin:…@141.244.222.191:5432/clx'` to connect
directly (Postgres is reachable from the BOKU net and the VPN). Without it the
script goes through SSH and runs `psql` on the host as the `postgres` user.
Either way the session is read-only.

The inventory is one row per upload: `id, fileName, state, createdAt,
sizeBytes, sha256, uploadedBy`. `compare` hashes every `.xlsx` in the data repo
and prints the matching path, or `UNMATCHED`. `export` without `--all` fetches
only the unmatched blobs; each sha256 is verified against the database value
before the file is kept, and an existing file with a different hash is never
overwritten.

**Gate:** every one of the 18 uploads is either byte-identical to an archived
file or exported and committed. `CatchLogX-Data#6` verified 13 of 18 by sha256
on 2026-11-14; the inventory re-proves it before the old database is replaced.

**Result (2026-11-14, run against `clx` on the production host):** 18 uploads,
**0 unmatched** — every blob maps to a file in the data repo. All 18 were
exported anyway (see the decision above) and committed to
`legacy-uploads-2026-06/` with `inventur-prod-uploads.tsv`. Two findings from
the inventory:

- The uploads ran **2026-06-18 … 2026-06-24**, not in October. The test-data
  catalog's October date is the validation run, not the production import.
- **`2026_M_final.xlsx` was uploaded** (2026-06-19 11:26, `DB_ERROR`), so its
  rows are part of today's 464 654 catches.
- `2026_S_valid_final.xlsx` was **never** uploaded — its hash does not occur in
  production.

## Phase 1 — dev dry run (#204) — **run on 2026-11-15, green**

On the dev instance (a production clone since #188). **Order (Georg,
2026-11-14): wipe → migrate → import.** The wipe ran *before* the migration
because `Sampling.importId NOT NULL` (#202) cannot be applied to a database
whose samplings still carry `NULL`.

> **Consequence for #202:** the dev deploy is push-driven and runs
> `prisma migrate deploy` inside the deploy job. The wipe therefore has to
> happen **before** the #202 commit is pushed to `dev` — otherwise the deploy
> fails on the `NOT NULL` alter. The alternative (backfilling the 18 legacy
> uploads into synthetic `Imports` rows) was rejected with the cutover
> decision: the fresh database has one state only.
>
> **Done on dev on 2026-11-15:** dump `~/backups/pre-imports-model-20261114T231621Z.dump`
> (56 MB; deleted in the cleanup of 2026-11-15, #212 — the 464 654-catch state
> lives in production and in the nightly archive `~/backups/20261115T023818Z.tar.zst`),
> then wipe — **464 654 catches / 10 497 samplings / 6 260 sites /
> 18 uploads / 18 upload blobs** removed, 3 template blobs kept, sequences
> reset — then `fish_species` emptied and reloaded from the JSON master (165).
> The #202 push deployed and applied `20261114230855_imports_model` on the
> empty database (release `8a0f1f0`, app 200). Dev then held 0 catches, 165
> species, 9 users, 3 templates.

### 1. Wipe the fish data, keep the masters

Not `scripts/demo/wipe-fish.ts` — that one deletes only `fish_species` and
exists for a half-written seed, not for cleanup. Use **`TRUNCATE`, not
`DELETE`** (measured on dev 2026-11-15, #210):

```sql
-- the app must be stopped: ACCESS EXCLUSIVE, nothing else may hold these tables
TRUNCATE TABLE fish_catches, samplings, river_sites RESTART IDENTITY;
```

`TRUNCATE` takes **0.1 s**. The `DELETE` chain it replaces
(`DELETE FROM fish_catches; DELETE FROM samplings; DELETE FROM river_sites;`
plus three `setval` calls) needed **~6 minutes** for 464 654 catches / 10 497
samplings: `fish_catches` carried only `fish_catches_pkey` — no index on
`samplingId` — so the `ON DELETE RESTRICT` foreign key seq-scanned the whole
catch table once per deleted sampling (backend at 99.7 % CPU for minutes). All
three tables are named in one statement, so no `CASCADE` is needed, and
`RESTART IDENTITY` replaces the three `setval` calls.

The index now exists (#211), and it changes the picture without changing the
recipe: the same wipe as `DELETE` runs in **2.4 s** on the prod clone (with
`river_sites` 2.0 s of it), so a `DELETE` wipe is no longer dangerous — but
`TRUNCATE` stays: one statement, sequence reset included, no per-row WAL, and
it makes the intent unmistakable.

- **`fish_species` is the 165-entry master from `assets/species.json`**, not
  the old 125-entry seed — the import validates every species against it, and a
  missing entry rejects the whole file (#80). A prod clone still carries the
  seed, and `insert-fish.ts` cannot upgrade it in place (`P2002`: the master
  renames id 93 to a name id 94 already holds, see `PITFALLS.md`), so the table
  is **emptied and reloaded** while no catch references it:
  `DELETE FROM fish_species;` then `npx tsx scripts/demo/insert-fish.ts` →
  165 rows. On the fresh production database the table starts empty anyway, so
  this is the same step there.
- **`FileBlob` rows behind `Uploads`:** the #202 migration drops `Uploads`, so
  those blobs become orphans. They are already archived in
  `legacy-uploads-2026-06/` (Phase 0), so delete them explicitly rather than
  carrying dead weight. `TemplateFiles` blobs are **not** affected.
- The wipe scripts require `ALLOW_DESTRUCTIVE_SEED=<hostname>/<db>`; a manual
  `psql` session bypasses that guard, so print the database name first.

### 2. Migrate

`npx prisma migrate deploy` — applies #202's migration (drops `Uploads`,
creates `Imports`, `Sampling.importId NOT NULL`). On dev this normally happens
in the deploy job; run it by hand only if the release is already published.

**It only applies to a wiped database.** `20261114230855_imports_model` starts
with `ALTER TABLE "samplings" ADD COLUMN "importId" TEXT NOT NULL`, which fails
with `23502` (Prisma `P3018`) as soon as a single sampling exists. Measured on
dev 2026-11-15 (#210) against the pre-#202 dump: the migration rolls back
cleanly, but the failed row stays in `_prisma_migrations` and **every later
deploy is refused with `P3009`** until
`npx prisma migrate resolve --rolled-back 20261114230855_imports_model`. This is
the technical reason for the wipe → migrate → import order, and it is why
`catchlogx-dev-restore.sh` cannot migrate a freshly restored production dump
(see `deploy/vps/dev-restore/README.md`).

### 3. Import

Through the **real upload/import path** — no script, no bypass — file by file
in name order (`POST /api/upload/new`, one request per file so each gets its
own transaction and its own numbers). Since #202 the upload **imports
directly**: it validates and writes in one transaction, there is no admin
accept step, and a file whose bytes are already imported (sha256, active
imports only) is refused. Each file lands as one `Imports` row with its
original file stored; the samplings it creates carry that `importId`, so
`deleteImport` can remove a file's data again.

**Result (2026-11-15) — 9 of 13 files, exactly the expected numbers:**

| # | File | Rows | Samplings | HTTP time |
|---|---|---:|---:|---:|
| 1 | `2026_A_valid_final.xlsx` | 1 939 | 107 | 4.4 s |
| 2 | `2026_B_valid_final.xlsx` | 13 454 | 67 | 11.8 s |
| 5 | `2026_G_valid_final.xlsx` | 7 304 | 25 | 6.2 s |
| 7 | `2026_K_valid_final.xlsx` | 15 492 | 76 | 12.5 s |
| 8 | `2026_L_valid_final.xlsx` | 3 162 | 42 | 3.3 s |
| 9 | `2026_N_O_P_valid_final.xlsx` | 26 980 | 133 | 23.7 s |
| 10 | `2026_R_valid_final.xlsx` | 1 914 | 22 | 2.5 s |
| 12 | `2026_T_valid_final.xlsx` | 35 413 | 612 | 36.4 s |
| 13 | `2026_W_Y_Z_valid_final.xlsx` | 22 936 | 198 | 19.6 s |
| | **total** | **128 594** | **1 282** | |

Database afterwards: **128 594 catches / 1 282 samplings / 1 095 river sites /
9 active imports / 12 blobs** (9 import originals + 3 templates). Every
`Sampling.importId` is set, every catch resolves to a `fish_species` row
(67 of the 165 species are used).

**The four species-blocked files reject and write nothing** (counts unchanged
before and after, no `Imports` row, no orphan blob):

| File | Answer | Detail |
|---|---|---|
| `2026_D_valid_final_DaniohnePIT.xlsx` | 400 | `Proterorhinus marmoratus`, **2 rows (Excel 6227, 7330)** — since #213 no longer a structural error |
| `2026_E_F_valid_final.xlsx` | 400 | `Salvelinus fontinalis × Salvelinus umbla`, 10 rows |
| `2026_I_valid_final.xlsx` | 400 | same species, 4 rows |
| `2026_S_valid_final.xlsx` | 400 | same species, 2 rows |

**`deleteImport` drill:** `2026_R` deleted through `DELETE /api/admin/imports/{id}`
→ `{catches: 1914, samplings: 22}`, blob removed (12 → 11), `river_sites`
untouched (1 095, shared), `Imports` row kept as tombstone (`deletedAt`,
`deletedByUserId`, `blobId = null`, `rowCount` preserved). Re-import restored
the counts; a second upload of the same bytes was refused with the duplicate
message naming the import. Repeated at scale with `2026_T` (35 413 catches,
612 samplings): the delete took **7.8 s** — over the old 5 s transaction
default, so the same #209 fix was needed on the delete path — and removed
exactly its rows (128 594 → 93 181 catches, 1 282 → 670 samplings, sites
unchanged). Re-imported afterwards; dev is back at 128 594 / 1 282 / 1 095.

> **Changed on 2026-11-15 (#184):** the delete is *hard* now — the `Imports`
> row goes too, there is no tombstone, and a second delete of the same id
> answers 404. A re-run of this drill will therefore show one `Imports` row
> fewer and no "Deleted on …" line in either list.

### 4. Rollback drill

Exercised on 2026-11-15 without destroying the dry-run data: the pre-wipe dump
was restored into a **second database** (`clx_rollback`, 6.3 s), `DATABASE_URL`
was pointed at it, `~/current` was repointed to the matching **pre-#202
release** (`4412e64`) and the unit restarted. Result: app active, sign-in 200,
`/api/admin/fetch-all` served the 18 legacy uploads, and the restored database
holds exactly **464 654 catches / 10 497 samplings / 6 260 sites / 125 species
/ 18 uploads**. Then flipped back (`.env` restored from a byte copy, `~/current`
→ `e26bcaf`, restart, health check, dry-run counts verified again).

Two things the drill taught that the plan did not have:

- **A rollback is a pair: release *and* database.** The pre-#202 dump has no
  `Imports` table, so the current release cannot serve it. Pointing
  `DATABASE_URL` at the old database without repointing `~/current` gives a
  broken app, not a rollback.
- **`QUERY_DATABASE_URL` is a second, independent pointer.** The SQL page kept
  reading the *new* database during the drill because only `DATABASE_URL` was
  flipped. A production rollback must flip both (or the SQL page answers from a
  database the app no longer uses).

**Gate — all green:** every file that passes validation imports with row counts
matching its source exactly (128 594 = 128 594); the four blocked files are
rejected with the full species list and write nothing; `deleteImport` removes
one import cleanly; the rollback drill works in both directions. Phase 1b — all
13 files — runs after the Excel repair and is the real rehearsal for the
production window.

### Findings from the dry run (2026-11-15)

1. **Prisma's 5 s transaction default killed the large files.** `2026_B`
   (13 454 rows) answered 500 with `Transaction already closed`; the write path
   had no explicit `timeout`. Fixed in **#209** (`{ timeout: 120_000,
   maxWait: 10_000 }` on `writeImports` and `deleteImport`) and verified: the
   same file then imported in 11.8 s, `2026_T` (35 413 rows) in 36.4 s. The
   rollback on failure was clean — no partial rows, no orphan blob, no
   `Imports` row — so only the limit was wrong.
2. **`2026_D` looked structural, and the fix was the validator, not the file.**
   The file has only a `DATA` sheet — no `List`, no `Instructions` — and was
   rejected as a structural error *before* the species check. The reaction was
   first "the file needs its `List` sheet back"; **#213 reversed that** (see
   "Open decisions" below): the sheet carries the Excel dropdowns, not the
   import contract. Since the change, the same upload reaches the species check
   and fails **only** on its two `Proterorhinus marmoratus` cells (Excel rows
   6227 and 7330). No sheet has to be rebuilt for the repair.
3. **There is no PIT data — anywhere.** `pit_dec`, `pit_hex`, `reader_id`,
   `memory_id` and `recapture` are empty in every delivered file (checked
   column by column on `2026_T`, 35 413 rows: all five at 0 %), and the
   pre-wipe production database has **0** real tags (17 rows carry an empty
   string, 0 recaptures). The verification step "a known `pit_dec` resolves to
   the same individual across two samplings" is therefore **not executable**
   and must be replaced — a site/species/date spot check does the same job.
   The data repo's "no duplicate `pit_dec` in any file" is true but vacuous.
4. **Site coverage closes exactly.** The old database has 6 260 site codes; the
   9 imported files produce 1 095 of them, so 5 165 codes do not recur — mostly
   coordinate drift (same `river_name`+`site_name`, different lat/long). At the
   **(river, site) name** level the picture is complete: 1 320 pairs in the old
   database = 256 from the 9 files + 112 from the four blocked files + 123 from
   `2026_M` + 829 from the June-23 delivery, **0 unexplained**. That confirms
   the June-23 delivery as real, distinct content (63 % of the old coverage)
   and makes `CatchLogX-Data#207` a data-completeness requirement, not a
   nice-to-have.
5. **`2026_R`'s duplicate refusal is a 400 with a validation report**, not the
   409 documented in #202: 409 is reserved for the race inside the write
   transaction. Both are correct; the runbook wording was wrong.

### Phase 1c — Route C, wipe instead of an empty database (2026-11-15, #210)

Phase 1a started from an **empty** database. That works, but it throws away
what the old database already knows correctly: users, password hashes,
`TemplateFiles` and `UserQueries`. Route C keeps them by starting the rebuild
on a **wiped copy of production**, which is also what Phase 2 does now.

Rehearsed on dev on 2026-11-15, in this order — the order is the whole point:

| Step | Result |
|---|---|
| 1. Dump `clx`, rename it to `clx_prev`, restore pre-#202 dump into a fresh `clx` | 6.5 s, exactly 464 654 / 10 497 / 6 260 / 125 / 18 uploads / 21 blobs |
| 2. `prisma migrate deploy` **on the data copy** (the counter-test) | **fails**: `P3018`, `23502 column "importId" … contains null values`; rollback clean; retry → `P3009`; `migrate resolve --rolled-back` clears it |
| 3. Wipe: `TRUNCATE … RESTART IDENTITY`, delete the 18 upload blobs, `DELETE FROM fish_species` + `insert-fish.ts` | 0.1 s for the truncate, 165 species, 3 template blobs, still 9 users / 3 templates / 2 saved queries |
| 4. `prisma migrate deploy` on the wiped copy | **green in 2.2 s** — `imports_model` + `import_hard_delete` applied, `Uploads` dropped, `samplings.importId NOT NULL` |
| 5. `clx_readonly` whitelist + `pg_stat_statements` revoke, start the app | health check 200 after 2 s, sign-in 200 |
| 6. Import the 9 importable files through `POST /api/upload/new` (one request each) | **128 594 catches / 1 282 samplings / 1 095 sites / 9 imports / 12 blobs** — identical to Phase 1a, per file: A 3.5 s, B 9.6 s, G 5.6 s, K 11.9 s, L 3.0 s, N_O_P 19.6 s, R 1.8 s, T 33.2 s, W_Y_Z 16.8 s |
| 7. Delete all 9 imports through the admin endpoint the GUI calls | 9 × `DELETE /api/admin/imports/{id}`, 0.2–8.3 s each (14 s total); second delete of the same id → 404; afterwards **0 catches / 0 samplings / 0 imports / 3 blobs**, `river_sites` 1 095 and `fish_species` 165 stay, sequences keep running |

Two things this settles:

- **The migration only ever needed an empty `samplings` table, not an empty
  database.** Users, templates and saved queries do not get in its way, so
  Phase 2 no longer needs its manual "recreate users, re-upload templates,
  restore saved SQL queries" step.
- **"Delete everything via the GUI" is a per-import operation, and it reaches
  exactly the rows that have an `Imports` row.** In Route C every catch belongs
  to an import, so 9 clicks empty the database. The old mass (464 654 catches,
  no provenance) was never deletable through any GUI — the pre-#202 admin page
  only had accept/deny, and `river_sites`, `fish_species` and the sequences are
  not GUI-deletable in any version.

Dev ends the drill at 0 catches / 165 species / 9 users / 3 templates, i.e. the
state Phase 1b wants: the file hashes are gone with the imports, so the 13
files can be uploaded again without hitting the duplicate check. The drill's
own artefacts (`clx_prev` with the 113 102-catch state, and the
`~/backups/pre-route-c-<timestamp>.dump`) were **deleted in the cleanup of
2026-11-15** (#212): the 464 654-catch state lives in production and in the
nightly archive `~/backups/20261115T023818Z.tar.zst`, and the 113 102-catch
state is reproducible by importing the 9 files again (~2 min, rehearsed three
times).

The drill's slowest finding was fixed the same day (#211, release `92b9132`):
`FishCatch.samplingId` now has an index. Measured before/after on the same
data — the foreign-key check `SELECT 1 … FOR KEY SHARE` drops from 23.8 ms to
0.13 ms, deleting 100 samplings from 1 440 ms to 3.8 ms, the full `DELETE`
wipe of the prod clone from ~6 min to **2.4 s**, and `deleteImport` for
`2026_T` (35 413 catches / 612 samplings) from **8.3 s to 0.52 s**.

## Phase 2 — production window (#204)

Written 2026-11-15 from the dev rehearsals (Phase 1a and 1c) and executed that
day; the measured numbers are in "Phase 2 — result" below. **The order is the
whole runbook**: the wipe has to happen *before* the deploy, because the deploy
job runs `prisma migrate deploy` and `imports_model` cannot be applied to a
database whose `samplings` still carry rows (P3018/P3009, see §2 and
`PITFALLS.md`).

**Prerequisites, verified read-only before the window** (2026-11-15):

| Check | Value on production |
|---|---|
| counts before | 464 654 catches / 10 497 samplings / 6 260 sites / 125 species / 21 blobs (18 uploads + 3 templates) |
| migration history | only `20261017190000_init` and `20261017200000_replace_minio_with_file_blobs` — the same state the dev counter-test rehearsed |
| releases | `~/current` → `1266a87` (2026-10-30) is the pre-cutover release and stays on disk for a rollback |
| runners | `catchlogx-server` (boku) and `catchlogx-vps` online |
| app | `catchlogx.service` active, `127.0.0.1:3001` |
| last prod deploy | 38 s dispatch → health check |

**Steps**

1. **Announce** (text below). The app stays up; only the data is briefly empty.
2. **Dump off-host**, before anything destructive:
   `pg_dump -Fc clx > ~/backups/pre-cutover-<ts>.dump` and copy it off the
   machine (`pg_restore -l` must read it). This dump is the rollback.
3. **Stop the app**: as the user of `catchlogx.service` (boku runner is a
   *system* service, so use `sudo -u clxadmin XDG_RUNTIME_DIR=/run/user/1000
   DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user stop
   catchlogx.service`). `TRUNCATE` needs `ACCESS EXCLUSIVE`.
4. **Delete the legacy upload blobs while `Uploads` still exists** — after the
   migration the table is gone and the 18 blobs are orphans with no owner:
   `DELETE FROM "FileBlob" WHERE id IN (SELECT "blobId" FROM "Uploads");`
   → 21 blobs become 3 (the templates).
5. **Wipe the fish data, keep the users**: `TRUNCATE TABLE fish_catches,
   samplings, river_sites RESTART IDENTITY;` (0.1 s, §1). Users,
   `TemplateFiles`, `UserQueries` and `Session` stay.
6. **Empty the species master**: `DELETE FROM fish_species;` — the 165-entry
   JSON master cannot be upserted over the 125-row seed (`P2002`, `PITFALLS.md`).
7. **Deploy the release** (`production-deploy.yml`, dispatch with the master
   SHA): `migrate deploy` applies `imports_model` and `import_hard_delete` on
   the emptied database, publishes, restarts, health-checks.
8. **Load the species master**: from the deployed checkout,
   `npx tsx scripts/demo/insert-fish.ts` → 165 rows (the seed guard passes, the
   database holds no catch).
9. **Import the deliverables** through the real path:
   `CUTOVER_USER=… CUTOVER_PASS=… ./import-deliveries.sh http://127.0.0.1:3001
   <CatchLogX-Data>/should_work A B G K L N_O_P R T W_Y_Z` — one request per
   file, each row count asserted against the table in "Scope". `--probe`
   asserts the rejection of the blocked ones (`--probe … D E_F I S`).
   The import needs a `SUPER_ADMIN` session; the window creates a temporary
   account for it and deletes it in step 12 (`CatchLogX-Data` holds no
   credentials, and the researchers' accounts are theirs).
10. **Read-only role and the SQL page**: `KEEP_PASSWORD=1
    ./deploy/prod/postgres/readonly-role.sh` (repairs the whitelist and keeps
    the password the research group already has), then put
    `QUERY_DATABASE_URL=postgresql://clx_readonly:<READONLY_DB_PASSWORD,
    percent-encoded>@127.0.0.1:5432/clx` into `~clxadmin/.config/catchlogx/.env`
    (it was **missing** on production until this window — without it the SQL
    page answers 500, `deploy/prod/postgres/README.md`) and restart the unit.
11. **Verify** (see below): per-file counts, species coverage, a site/species/
    date spot check, one real query through the SQL page, a download, sign-in.
12. **Remove the temporary account** and record the numbers here.

**Post-cutover, as regular uploads** (no window): the four files blocked on
`CatchLogX-Data#7`, then `2026_M` (#206) and the June-23 delivery (#207).

## Verification

- Row counts per file and in total (183 855 expected before the June files).
- Species coverage: every imported `speciesName` exists in `fish_species`.
- **PIT spot check — not executable, and not needed.** The delivered files
  carry no PIT data at all (`pit_dec`, `pit_hex`, `reader_id`, `memory_id`,
  `recapture` are empty in every file) and the old database had 0 real tags.
  Replace it with a **site/species/date spot check**: pick a `siteCode`, a date
  and a species from a source file and confirm the same counts in the database.
- One real query from the research group's R session over `clx_readonly` —
  done on dev on 2026-11-15 through the app's SQL page
  (`Salmo trutta` 31 359 / `Cyprinidae` 15 604 / `Squalius cephalus` 13 509).

## Rollback

The old dump is restored into a new database and `DATABASE_URL` is pointed at
it; `~/current` (the release) is untouched. The cutover never rewrites the old
database, so rollback is a restore, not an undo.

## Announcement

Tell the research group before the window, and state explicitly what is **not**
coming back yet:

- Production will hold **183 855 catches instead of 464 654**. The rebuild
  imports files, not rows: everything that production accumulated from repeated
  imports of the same deliveries (the June uploads of the 13 files, the three
  variants of one June delivery, and the earlier `E_F`/`S` versions) does not
  come back as a duplicate. `2026_M` (63 385) follows as a regular upload once
  its `site_name` cells are filled (#206), the June-23 delivery (45 380) as
  soon as its return is decided (#207) — together they carry 952 of the 1 320
  site pairs the old database had.
- ids have changed; joins must use content (`siteCode`, `river_name` +
  `site_name`, date), not `samplings.id` / `fish_catches.id`.
- **`siteCode` values change too**: the same physical site can appear under a
  new code because the delivered coordinates differ from what the June imports
  stored (same `river_name` + `site_name`, different lat/long). 5 165 of the
  6 260 old codes do not recur.
- **There is no PIT data in the delivered files** and there was none in
  production (0 real tags, 0 recaptures). Anything built on `pit_dec` has no
  data before or after the cutover.

## Open decisions

- **The three June-23 files are a delivery of their own, not an earlier `M`.**
  Verified 2026-11-14: 46 216 rows each, 45 380 distinct rows, identical across
  all three variants, covering Donaukanal (1 959), Drau (19 454) and Donau
  (24 803). Zero site overlap with all 13 `should_work` files and zero with
  `2026_M`; the raw `Bulk import/2026_D.xlsx` (1 022 183 rows, deleted in
  `e9a6f4b`) does contain `Donaukanal` and `Drau`. So the data is a slice of the
  raw D delivery that the curated `2026_D_valid_final_DaniohnePIT.xlsx` does not
  contain. **Confirmed as real content by the dry run (2026-11-15):** at the
  (river, site) name level the old database's 1 320 pairs split exactly into
  256 (9 files) + 112 (blocked 4) + 123 (`2026_M`) + **829 (June-23)** with zero
  unexplained — so the June-23 delivery carries 63 % of the site coverage the
  cutover would otherwise lose. **Open:** does it come back as a post-cutover
  upload, or did Lena drop it deliberately? `CatchLogX-Data#207` tracks the
  import; until it lands, the 13-file set is not content-complete. (Method: site
  key `river_name|lat_up|long_up` and a row fingerprint over 15 columns,
  compared against all 13 `should_work` files and `2026_M`; the raw D file was
  checked via its `sharedStrings`.)
- `Salvelinus fontinalis × Salvelinus umbla` (16 rows in 3 files) has no
  counterpart in the master. Two routes, and they are not equivalent:
  - **A genuine missing hybrid** → one new entry in `assets/species.json`
    (next free id: 166) plus a commit on `dev`. The three files then import
    **as delivered** — no Excel bytes touched, no `docs/reparaturen.md` entry.
    The admin GUI is the inspection surface, not the vehicle: it writes
    `fish_species` rows **only**, and the cutover builds the fresh production
    table from the JSON master *before* the first import, so a GUI-created row
    would be gone after the rebuild and the files would be rejected again.
  - **A mis-entry for id 106** (`Salvelinus alpinus x Salvelinus fontinalis`) →
    repair the 16 cells in the data repo, master unchanged.

  Lena decides (`CatchLogX-Data#7`). **Ordering rule whichever way it goes:**
  the JSON master is edited **before** anyone clicks the species into a GUI —
  a GUI row takes a sequence id, and a later `insert-fish.ts` against a rebuilt
  database dies with `P2002` on the unique name (the same trap as the 125 → 165
  seed, `PITFALLS.md`). **Hard gate:** #80 rejects a whole file on an unknown
  species, so `2026_E_F`, `2026_I` and `2026_S` import nothing until one of the
  two routes lands.
- `2026_D` needs **one** repair, not two (since #213). Its 2
  `Proterorhinus marmoratus` cells (Excel rows 6227 and 7330) are a taxonomic
  synonym of `Proterorhinus semilunaris` (id 80) and need the file repaired. The
  dry run (2026-11-15) first saw the file rejected as a **structural** error
  because it carries only a `DATA` sheet — no `List`, no `Instructions`. That
  rule was dropped in **#213**: the `List` sheet is the Excel dropdown, not the
  import contract, and the species is checked against `fish_species` in every
  case. **The `List` sheet does not have to be rebuilt** — verified on dev
  2026-11-15: the file now answers with exactly those two rows.
  `CatchLogX-Data#7` carries the cell repair only.

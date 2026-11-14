# Production cutover — rebuild the database from the `-data` files (#200)

**Status (2026-11-14).** The phases and numbers below are verified against the
19 files in `CatchLogX-Data`, but no step has been run end to end yet. Phase 1
(dev dry run) is specified and ordered; Phase 2 is still **TODO (#204)** and is
filled in from what Phase 1 proves.

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

## Phase 1 — dev dry run (#204)

On the dev instance (a production clone since #188). **Order (Georg,
2026-11-14): wipe → migrate → import.** The wipe runs *before* the migration
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
> (56 MB), then wipe — **464 654 catches / 10 497 samplings / 6 260 sites /
> 18 uploads / 18 upload blobs** removed, 3 template blobs kept, sequences
> reset — then `fish_species` emptied and reloaded from the JSON master (165).
> The #202 push deployed and applied `20261114230855_imports_model` on the
> empty database (release `8a0f1f0`, app 200). Dev now holds 0 catches, 165
> species, 9 users, 3 templates.

### 1. Wipe the fish data, keep the masters

Not `scripts/demo/wipe-fish.ts` — that one deletes only `fish_species` and
exists for a half-written seed, not for cleanup. The cutover needs the delete
order from `scripts/demo/wipe-and-seed.ts`, without the seed step:

```sql
BEGIN;
DELETE FROM fish_catches;
DELETE FROM samplings;
DELETE FROM river_sites;                                  -- optional: the import upserts them
SELECT setval('fish_catches_id_seq', 1, false);
SELECT setval('samplings_id_seq', 1, false);
SELECT setval('river_sites_id_seq', 1, false);
COMMIT;
```

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

### 3. Import

Through the **real upload/import path** — no script, no bypass — file by file
in name order. Record per file: rows in the source, rows imported, samplings,
river sites created.

Since #202 the upload **imports directly**: `POST /api/upload/new` validates
and writes in one transaction, there is no admin accept step, and a file whose
bytes are already imported (sha256, active imports only) is refused with 409.
Each file lands as one `Imports` row with its original file stored; the
samplings it creates carry that `importId`, so `deleteImport` can remove a
file's data again (catches, samplings, blob; the `Imports` row stays as a
tombstone).

**Today 9 of the 13 import** (128 594 rows): `2026_A`, `B`, `G`, `K`, `L`,
`N_O_P`, `R`, `T`, `W_Y_Z`. The other four are rejected outright until the
Excel repair with Lena lands (`CatchLogX-Data#7`) — `2026_D` (2 ×
`Proterorhinus marmoratus`), `2026_E_F` (10), `2026_I` (4), `2026_S` (2), plus
the 16 `Salvelinus fontinalis × Salvelinus umbla` rows waiting on Lena's
target name. That is the intended behaviour, not a defect: a file with one
unknown species imports nothing.

### 4. Rollback drill

Exercise the rollback once (restore the pre-wipe dump) and confirm the app
serves again.

**Gate:** every file that passes validation imports with row counts matching
its source exactly; the four blocked files are rejected with the full species
list and write nothing; `deleteImport` removes one import cleanly (see #202);
the rollback drill is green. Phase 1b — all 13 files — runs after the Excel
repair and is the real rehearsal for the production window.

## Phase 2 — production window — TODO (#204)

1. Announce the window; the app is read-only or stopped during the import.
2. Fresh dump of the old database (`deploy/prod/backup/`), kept off-host.
3. Empty database, `prisma migrate deploy`.
4. Import the 13 files (no legacy variant, no `2026_M` — both come back later as
   regular uploads, see "Announcement").
5. Recreate users, re-upload templates, restore saved SQL queries if exported.
6. `deploy/prod/postgres/readonly-role.sh` (with `KEEP_PASSWORD=1`).
7. Health check: `127.0.0.1:3001`, nginx on port 80, sign-in, one download.

## Verification

- Row counts per file and in total (183 855 expected before the June files).
- Species coverage: every imported `speciesName` exists in `fish_species`.
- PIT spot check: a known `pit_dec` resolves to the same individual across two
  samplings.
- One real query from the research group's R session over `clx_readonly`.

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
  its `site_name` cells are filled (#206).
- ids have changed; joins must use content (`siteCode`, `pit_dec`, date), not
  `samplings.id` / `fish_catches.id`.

## Open decisions

- **The three June-23 files are a delivery of their own, not an earlier `M`.**
  Verified 2026-11-14: 46 216 rows each, 45 380 distinct rows, identical across
  all three variants, covering Donaukanal (1 959), Drau (19 454) and Donau
  (24 803). Zero site overlap with all 13 `should_work` files and zero with
  `2026_M`; the raw `Bulk import/2026_D.xlsx` (1 022 183 rows, deleted in
  `e9a6f4b`) does contain `Donaukanal` and `Drau`. So the data is a slice of the
  raw D delivery that the curated `2026_D_valid_final_DaniohnePIT.xlsx` does not
  contain. **Open:** does it come back as a post-cutover upload, or did Lena
  drop it deliberately? Until that is answered, the 13-file set is not provably
  content-complete. (Method: site key `river_name|lat_up|long_up` and a row
  fingerprint over 15 columns, compared against all 13 `should_work` files and
  `2026_M`; the raw D file was checked via its `sharedStrings`.)
- `Salvelinus fontinalis × Salvelinus umbla` (16 rows in 3 files) has no
  counterpart in the master. Either a mis-entry for id 106
  (`Salvelinus alpinus x Salvelinus fontinalis`) or a genuinely missing hybrid —
  Lena decides; the Excel repair follows from that. **Hard gate:** #80 rejects a
  whole file on an unknown species, so `2026_E_F`, `2026_I` and `2026_S` import
  nothing until this is repaired.
- `Proterorhinus marmoratus` (2 rows, one file) is a taxonomic synonym of
  `Proterorhinus semilunaris` (id 80) — repair the file. Same hard gate:
  `2026_D` imports nothing until then.

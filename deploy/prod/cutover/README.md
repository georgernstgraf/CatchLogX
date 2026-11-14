# Production cutover — rebuild the database from the `-data` files (#200)

**Status: skeleton (2026-11-14).** The phases and numbers below are verified
against the 19 files in `CatchLogX-Data`, but no step has been run end to end
yet. Steps marked **TODO (#204)** are filled in and proven on the dev instance
before the production window.

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

## Scope

| Block | Files | Rows | Imported |
|---|---|---|---|
| `should_work/` (A … W_Y_Z) | 13 | 183 855 | **yes** |
| `should_not_work/2026_M_final.xlsx` | 1 | 63 385 | no — parked (#206) |
| `legacy-uploads-2026-06/` | 5 | 178 011 | no — earlier versions of the same deliveries |
| missing June uploads (prod only) | 13 | ~39 000 | **export first** (#203) |

Production holds 464 654 catches, the archive 426 251. The difference is
explained: 464 654 − 247 240 (the 14-file bulk from #132) − 178 011 (the five
archived June files) ≈ 39 000 = the 13 June blobs that were never exported.

### Validation state of the 13 cutover files (2026-11-14)

- **Structure:** all green. (`2026_M_final.xlsx` fails with 1 638 rows without
  `site_name` — parked.)
- **Species:** 6 distinct strings do not match the 165 master entries. Three
  are pure normalisation (NBSP in 171 rows, `(hybrid)` suffix in 2) and are
  caught by `normalizeSpeciesName`; two need an Excel repair now (18 rows in
  4 files, `CatchLogX-Data#7`). The third (`Leuciscus aspius hyb`) only occurs
  in the parked M file.
- **PIT:** no duplicate `pit_dec` within any file, in none of the 19 files.

## Phase 0 — archive completeness (read-only) — #203

Nothing may be deleted before every original file exists in `CatchLogX-Data`.

```sql
SELECT u.id, u."fileName", u.state, u."createdAt",
       length(b.data) AS bytes, encode(sha256(b.data), 'hex') AS sha256
FROM "Uploads" u JOIN "FileBlob" b ON b.id = u."blobId"
ORDER BY u."createdAt";
```

Compare the `sha256` values with the five files already archived, export the
remaining 13 with `scripts/prod/export-upload-blobs.ts` (read-only), verify each
hash, and commit them into `CatchLogX-Data` (append-only).

**Gate:** 18 of 18 blobs archived and hash-verified.

## Phase 1 — dev dry run — TODO (#204)

On the dev instance (a production clone since #188):

1. Empty database, `npm run prisma:deploy` (migration history only, no seed).
2. Import the 13 files through the real upload/import path — no script, no
   bypass.
3. Record: catches, samplings, river sites, species, per-file row counts.
4. Compare against the expectation (183 855 rows, 165 species) and against the
   per-file counts in the table above.
5. Exercise the rollback once.

**Gate:** every file accepted, row counts match the source files exactly,
`deleteImport` removes one import cleanly (see #202).

## Phase 2 — production window — TODO (#204)

1. Announce the window; the app is read-only or stopped during the import.
2. Fresh dump of the old database (`deploy/prod/backup/`), kept off-host.
3. Empty database, `prisma migrate deploy`.
4. Import the 13 files (plus the exported June files that hold unique content).
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

- `2026_M_final.xlsx` (63 385 catches) stays out until the `site_name` question
  is decided (#206) — production will hold ~401 269 catches instead of 464 654.
- ids have changed; joins must use content (`siteCode`, `pit_dec`, date), not
  `samplings.id` / `fish_catches.id`.

## Open decisions

- `Salvelinus fontinalis × Salvelinus umbla` (16 rows in 3 files) has no
  counterpart in the master. Either a mis-entry for id 106
  (`Salvelinus alpinus x Salvelinus fontinalis`) or a genuinely missing hybrid —
  Lena decides; the Excel repair follows from that.
- `Proterorhinus marmoratus` (2 rows, one file) is a taxonomic synonym of
  `Proterorhinus semilunaris` (id 80) — repair the file.

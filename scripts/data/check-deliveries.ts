#!/usr/bin/env tsx
/**
 * Pre-flight gate for a cutover batch: runs the **real** upload validation
 * (`validateWorkbook`, the same code path `POST /api/upload/new` uses) over a
 * list of delivered workbooks, without touching a database.
 *
 * Usage:
 *   npx tsx scripts/data/check-deliveries.ts <file.xlsx> [<file.xlsx> …]
 *
 * Prints one line per file (rows, structural error, error count, the offending
 * species values) and exits 1 if any file would be rejected. The numbers only
 * mean something against the species master in `assets/species.json` — a file
 * that passes here still has to pass the import, but a file that fails here
 * cannot import (#213: the `List` sheet is not required; the species is checked
 * against the master).
 *
 * `SPECIES_MASTER=<path>` checks against a candidate master instead — that is
 * how "the files stay as delivered, the master grows" is tested before anything
 * is committed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// The validation module imports the Prisma singleton at module load; the checks
// below never touch it. Give it a syntactically valid URL so the import works
// without a database, then load the module dynamically.
process.env.DATABASE_URL ||= "postgresql://placeholder@127.0.0.1:5432/placeholder";

const { validateWorkbook } = await import("@/services/uploadService");
const { buildSpeciesIndex } = await import("@/lib/fishSpecies");

const masterPath =
  process.env.SPECIES_MASTER ?? path.join(process.cwd(), "assets", "species.json");
const master = JSON.parse(readFileSync(masterPath, "utf8")) as {
  id: number;
  speciesName: string;
  notInArtliste?: boolean;
}[];
const index = buildSpeciesIndex(master);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: npx tsx scripts/data/check-deliveries.ts <file.xlsx> …");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const buffer = readFileSync(file);
  const result = validateWorkbook(path.basename(file), buffer, index);
  const speciesErrors = result.errors.filter((e) => e.column === "species");
  const offending = [...new Set(speciesErrors.map((e) => String(e.value)))];
  const rows = speciesErrors.map((e) => e.row);
  const ok = !result.structuralError && result.errors.length === 0;
  if (!ok) failed = true;

  console.log(
    [
      ok ? "OK  " : "FAIL",
      path.basename(file).padEnd(38),
      `rows ${String(result.dataRowCount).padStart(6)}`,
      `errors ${String(result.errors.length).padStart(3)}`,
      result.structuralError
        ? `structural: ${result.structuralError.details}`
        : offending.length
          ? `species: ${offending.join(", ")} (rows ${rows.join(", ")})`
          : "",
    ].join("  "),
  );
}

process.exit(failed ? 1 : 0);

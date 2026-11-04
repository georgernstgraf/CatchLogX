// Generates assets/species.json from the binding Artliste Excel (#183).
//
//   npx tsx scripts/generate-fish-species-json.ts           # dry run: print the report
//   npx tsx scripts/generate-fish-species-json.ts --write   # write assets/species.json
//   npx tsx scripts/generate-fish-species-json.ts --check   # verify, exit 1 on drift
//
// The merge never drops a seed id silently: unmatched entries are kept with
// notInArtliste: true, name collisions fail the run. speciesName, germanName
// and family always come from the Excel; ids stay stable.

import { readFileSync, writeFileSync } from "node:fs";
import XLSX from "xlsx";
import {
  mergeArtliste,
  type ArtlisteRow,
  type SpeciesMasterRow,
} from "../lib/fishSpecies";

const EXCEL_PATH = "assets/20261019_Artliste.xlsx";
const JSON_PATH = "assets/species.json";
const SHEET = "Fische Ö";

// Seed ids normalization cannot match; confirmed by Lena (2026-11-04).
const ALIASES: Record<number, string> = {
  // Rutilus rutilus x Scardinus erythrophthalamus (hybrid) -> Excel name without suffix
  97: "Rutilus rutilus x Scardinus erythrophthalamus",
  // Salvelinus fontinalis × Salvelinus umbla -> the only Salvelinus hybrid in the list
  106: "Salvelinus alpinus x Salvelinus fontinalis",
  // Rutilus hybrid is Rutilus rutilus hybrid — collides with id 93, resolved by MERGES
  90: "Rutilus rutilus hybrid",
  // Vimba x Blicca -> the Excel spells the cross out
  122: "Vimba vimba x Blicca bjoerkna",
  // id 60 (Leuciscus aspius/idus hyb) has NO alias: the issue's candidate
  // "Aspius aspius x Leuciscus idus" is already id 16 — aliasing it would
  // collide. Stays flagged until Lena decides (merge 60 into 16 or keep).
};

// Fold a duplicate seed id into its twin; the dropped id leaves the master.
const MERGES: { dropId: number; intoId: number }[] = [
  { dropId: 90, intoId: 93 },
  // "Rutilus rutilus hyb" (93) and "Rutilus rutilus hybrid" (94) normalize to
  // the same name; the Excel has a single entry. Keep the lower id (pending
  // confirmation with Lena).
  { dropId: 94, intoId: 93 },
];

function readExcelRows(): ArtlisteRow[] {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[SHEET]);
  return rows
    .map((r) => ({
      scientificName: (r["Wissenschaftlicher Name"] ?? "").toString().trim(),
      germanName: (r["Deutscher Name"] ?? "").toString().trim(),
      family: (r["Familie"] ?? "").toString().trim() || null,
    }))
    .filter((r) => r.scientificName !== "");
}

function readCurrentMaster(): SpeciesMasterRow[] {
  const raw = JSON.parse(readFileSync(JSON_PATH, "utf8")) as (SpeciesMasterRow & {
    latinName?: string;
  })[];
  // latinName was dropped with the master refactor — it always equaled speciesName.
  return raw.map((entry) => ({
    id: entry.id,
    speciesName: entry.speciesName,
    germanName: entry.germanName,
    family: entry.family,
    notInArtliste: entry.notInArtliste,
  }));
}

async function main() {
  const mode = process.argv[2] ?? "";
  if (!["", "--write", "--check"].includes(mode)) {
    console.error("Usage: tsx scripts/generate-fish-species-json.ts [--write|--check]");
    process.exit(2);
  }

  const result = mergeArtliste(readCurrentMaster(), readExcelRows(), {
    aliases: ALIASES,
    merges: MERGES,
  });

  console.log(
    `report: ${result.report.updated} updated, ${result.report.added} added, ` +
      `${result.report.removed} removed, ${result.report.flagged} flagged notInArtliste, ` +
      `${result.entries.length} entries total`,
  );
  if (result.report.excelDuplicates.length > 0) {
    console.log(`excel duplicates (first wins): ${result.report.excelDuplicates.join(", ")}`);
  }
  const flagged = result.entries.filter((e) => e.notInArtliste);
  if (flagged.length > 0) {
    console.log(
      `not in Artliste (kept, id/name unchanged): ` +
        flagged.map((e) => `${e.id} ${e.speciesName}`).join(", "),
    );
  }

  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`❌ ${error}`);
    process.exit(1);
  }

  const json = JSON.stringify(result.entries, null, 2) + "\n";

  if (mode === "--write") {
    writeFileSync(JSON_PATH, json);
    console.log(`✅ wrote ${JSON_PATH}`);
    return;
  }

  if (mode === "--check") {
    const current = readFileSync(JSON_PATH, "utf8");
    if (current !== json) {
      console.error(`❌ ${JSON_PATH} is out of date — run with --write`);
      process.exit(1);
    }
    console.log(`✅ ${JSON_PATH} is up to date`);
  }
}

main().catch((e) => {
  console.error("❌ generation failed:", e);
  process.exit(1);
});

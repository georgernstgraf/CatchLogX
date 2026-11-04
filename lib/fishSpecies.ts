// Species master merge (#183): the Artliste Excel is the binding source for
// speciesName, germanName and family; existing ids are kept stable.
// Pure functions only — the generator script (scripts/generate-fish-species-json.ts)
// does the file I/O, tests use inline fixtures (lib/fishSpecies.test.ts).

export type SpeciesMasterRow = {
  id: number;
  speciesName: string;
  germanName: string;
  family: string | null;
  /** Set when the entry has no counterpart in the Artliste Excel (pending clarification). */
  notInArtliste?: boolean;
};

export type ArtlisteRow = {
  scientificName: string;
  germanName: string;
  family: string | null;
};

export type MergeOptions = {
  /** seed id -> exact Excel scientific name, for pairs normalization cannot match */
  aliases: Record<number, string>;
  /** fold one seed id into another (e.g. a duplicate that the unique name cannot keep) */
  merges: { dropId: number; intoId: number }[];
};

export type MergeReport = {
  added: number;
  removed: number;
  updated: number;
  /** seed entries kept without an Excel counterpart (notInArtliste flag) */
  flagged: number;
  /** scientific names appearing more than once in the Excel (first wins) */
  excelDuplicates: string[];
};

export type MergeResult = {
  entries: SpeciesMasterRow[];
  report: MergeReport;
  /** hard errors — the generator must refuse to write when this is non-empty */
  errors: string[];
};

/**
 * Normalizes a scientific name for matching: NBSP -> space, × -> x,
 * "hyb" -> "hybrid", trailing "(hybrid)" removed, whitespace collapsed,
 * case-insensitive.
 */
export function normalizeSpeciesName(name: string): string {
  return name
    .replace(/\u00A0/g, " ")
    .replace(/\u00D7/g, " x ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\(hybrid\)$/i, "")
    .replace(/\bhyb\b\.?$/i, "hybrid")
    .trim()
    .toLowerCase();
}

export function mergeArtliste(
  current: SpeciesMasterRow[],
  excelRows: ArtlisteRow[],
  options: MergeOptions,
): MergeResult {
  const errors: string[] = [];
  const report: MergeReport = {
    added: 0,
    removed: 0,
    updated: 0,
    flagged: 0,
    excelDuplicates: [],
  };

  // Unique the Excel by normalized scientific name; the first row wins.
  const excelByName = new Map<string, ArtlisteRow>();
  for (const row of excelRows) {
    const key = normalizeSpeciesName(row.scientificName);
    if (!key) continue;
    if (excelByName.has(key)) {
      if (!report.excelDuplicates.includes(row.scientificName)) {
        report.excelDuplicates.push(row.scientificName);
      }
      continue;
    }
    excelByName.set(key, row);
  }

  const drops = new Set(options.merges.map((m) => m.dropId));
  const maxId = current.reduce((max, s) => Math.max(max, s.id), 0);

  // Update or keep the existing entries, preserving their order.
  const entries: SpeciesMasterRow[] = [];
  const matchedKeys = new Set<string>();
  for (const entry of current) {
    if (drops.has(entry.id)) {
      report.removed += 1;
      continue;
    }

    let row: ArtlisteRow | undefined;
    const aliasName = options.aliases[entry.id];
    if (aliasName !== undefined) {
      row = excelByName.get(normalizeSpeciesName(aliasName));
      if (!row) {
        errors.push(`unresolved alias for id ${entry.id}: "${aliasName}" not in Artliste`);
      }
    } else {
      row = excelByName.get(normalizeSpeciesName(entry.speciesName));
    }

    if (!row) {
      // Never drop a seed entry silently — keep it and make the state visible.
      report.flagged += 1;
      entries.push({ ...entry, notInArtliste: true });
      continue;
    }

    const key = normalizeSpeciesName(row.scientificName);
    matchedKeys.add(key);
    const changed =
      entry.speciesName !== row.scientificName ||
      entry.germanName !== row.germanName ||
      (entry.family ?? null) !== (row.family ?? null);
    if (changed) report.updated += 1;
    entries.push({
      id: entry.id,
      speciesName: row.scientificName,
      germanName: row.germanName,
      family: row.family,
    });
  }

  // A merge directive must reference an existing target id; a missing dropId
  // only means the directive was already applied (idempotent re-runs).
  for (const { dropId, intoId } of options.merges) {
    if (!current.some((s) => s.id === intoId)) {
      errors.push(`merge directive: target id ${intoId} (for dropped id ${dropId}) is not in the current master`);
    }
  }

  // Two seed ids landing on the same Excel name is only allowed via a
  // merge directive; anything else is a conflict, never a silent fold.
  const byKey = new Map<string, number[]>();
  for (const entry of current) {
    if (drops.has(entry.id)) continue;
    const name = options.aliases[entry.id] ?? entry.speciesName;
    const key = normalizeSpeciesName(name);
    byKey.set(key, [...(byKey.get(key) ?? []), entry.id]);
  }
  for (const [key, ids] of byKey) {
    if (ids.length > 1) {
      errors.push(`conflict: seed ids ${ids.join(", ")} all match "${excelByName.get(key)?.scientificName ?? key}"`);
    }
  }

  // New species: Excel rows no existing entry matched, in Excel row order.
  let nextId = maxId;
  for (const [key, row] of excelByName) {
    if (matchedKeys.has(key)) continue;
    nextId += 1;
    report.added += 1;
    entries.push({
      id: nextId,
      speciesName: row.scientificName,
      germanName: row.germanName,
      family: row.family,
    });
  }

  return { entries, report, errors };
}

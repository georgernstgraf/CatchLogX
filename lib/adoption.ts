import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

/**
 * Pure planning logic for the one-time adoption of the legacy production
 * database (the `prisma db push` era) to the migration-tracked baseline
 * (#139). The runner that executes the plan lives in
 * `scripts/adopt-legacy-prod.ts`; everything here is side-effect free so it
 * can be unit tested without a database.
 */

/** The three ways the legacy production schema differs from the baseline. */
export const LEGACY_TEMPLATE_TABLE = "DummyFiles";
export const TEMPLATE_TABLE = "TemplateFiles";
export const LEGACY_UPLOAD_COLUMN = "link";
export const LEGACY_TEMPLATE_COLUMN = "filePath";
export const BLOB_TABLE = "FileBlob";

export interface SourceFile {
  /** Path relative to the export root, with forward slashes. */
  relativePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
  sizeBytes: number;
}

export interface SourceIndex {
  byRelativePath: Map<string, SourceFile>;
  byBasename: Map<string, SourceFile[]>;
}

export interface BlobPlan {
  /** `Uploads` or `TemplateFiles` - the table whose row references the blob. */
  table: "Uploads" | "TemplateFiles";
  /** Primary key of the referencing row. */
  rowId: string;
  /** Value stored by the legacy schema (a MinIO object key or file name). */
  storedPath: string;
  source: SourceFile;
  fileName: string;
  mimeType: string;
}

export interface AdoptionPlan {
  /** True when the legacy template table must be renamed. */
  renameTemplateTable: boolean;
  /** True when the `FileBlob` table must be created. */
  createBlobTable: boolean;
  /** Referencing tables that still need a nullable `blobId` column. */
  addBlobIdColumnTo: Array<"Uploads" | "TemplateFiles">;
  /** One entry per row that still needs a blob. */
  blobs: BlobPlan[];
  /** Stored-path columns that must be dropped once every row is linked. */
  dropColumns: Array<{ table: "Uploads" | "TemplateFiles"; column: string }>;
  /** Referencing tables that still need their blob foreign key. */
  addForeignKeyTo: Array<"Uploads" | "TemplateFiles">;
  /** Referencing tables that must have `blobId` set NOT NULL. */
  setBlobIdNotNullOn: Array<"Uploads" | "TemplateFiles">;
  /** Rows whose referenced file could not be found in the export. */
  missingSources: Array<{ table: "Uploads" | "TemplateFiles"; rowId: string; storedPath: string }>;
}

export interface LegacyRow {
  id: string;
  storedPath: string;
}

export interface PlanInput {
  templateTableExists: boolean;
  blobTableExists: boolean;
  blobIdColumnOn: Record<"Uploads" | "TemplateFiles", boolean>;
  legacyColumnsPresent: Record<"Uploads" | "TemplateFiles", boolean>;
  foreignKeysOn: Record<"Uploads" | "TemplateFiles", boolean>;
  notNullOn: Record<"Uploads" | "TemplateFiles", boolean>;
  uploads: LegacyRow[];
  templates: LegacyRow[];
  index: SourceIndex;
}

/** LibreOffice Excel workbooks dominate this data set; everything else is a fallback. */
export function mimeTypeFor(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

/** Normalise an export path to forward slashes for lookup. */
export function normalizeRelativePath(pathLike: string): string {
  return pathLike.split(sep).join("/").replace(/^\.\//, "");
}

/**
 * Index every file below the export root. The export is produced by
 * `mc mirror`, so the tree is `<root>/CatchLogX/uploads/<name>` and
 * `<root>/CatchLogX/dummy_files/<folder>/<name>`.
 */
export function buildSourceIndex(root: string): SourceIndex {
  const byRelativePath = new Map<string, SourceFile>();
  const byBasename = new Map<string, SourceFile[]>();
  if (!existsSync(root)) return { byRelativePath, byBasename };

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const file: SourceFile = {
        relativePath: normalizeRelativePath(relative(root, absolutePath)),
        absolutePath,
        sizeBytes: statSync(absolutePath).size,
      };
      byRelativePath.set(file.relativePath, file);
      const list = byBasename.get(entry.name) ?? [];
      list.push(file);
      byBasename.set(entry.name, list);
    }
  };

  walk(root);
  return { byRelativePath, byBasename };
}

/**
 * Find the export file behind a stored path.
 *
 * Uploads store a bare file name (production predates the prefixed key), so
 * they are matched by base name; templates store the full object key
 * (`CatchLogX/dummy_files/<folder>/<name>`), so the exact relative path is
 * tried first and the base name is the fallback.
 */
export function resolveSource(index: SourceIndex, kind: "Uploads" | "TemplateFiles", storedPath: string): SourceFile | undefined {
  const normalized = normalizeRelativePath(storedPath);
  if (kind === "TemplateFiles") {
    const exact = index.byRelativePath.get(normalized);
    if (exact) return exact;
  }
  const matches = index.byBasename.get(basename(normalized)) ?? [];
  // Ambiguity is a data problem we want surfaced, not guessed at.
  return matches.length === 1 ? matches[0] : undefined;
}

export function planAdoption(input: PlanInput): AdoptionPlan {
  const blobs: BlobPlan[] = [];
  const missingSources: AdoptionPlan["missingSources"] = [];

  const planRows = (table: "Uploads" | "TemplateFiles", rows: LegacyRow[]): void => {
    for (const row of rows) {
      const source = resolveSource(input.index, table, row.storedPath);
      if (!source) {
        missingSources.push({ table, rowId: row.id, storedPath: row.storedPath });
        continue;
      }
      const fileName = basename(normalizeRelativePath(row.storedPath));
      blobs.push({
        table,
        rowId: row.id,
        storedPath: row.storedPath,
        source,
        fileName,
        mimeType: mimeTypeFor(fileName),
      });
    }
  };

  planRows("Uploads", input.uploads);
  planRows("TemplateFiles", input.templates);

  const addBlobIdColumnTo = (["Uploads", "TemplateFiles"] as const).filter((t) => !input.blobIdColumnOn[t]);
  // Dropping the legacy stored-path column is only safe once every row of that
  // table is linked to a blob.
  const legacyColumnFor = { Uploads: LEGACY_UPLOAD_COLUMN, TemplateFiles: LEGACY_TEMPLATE_COLUMN } as const;
  const dropColumns = (["Uploads", "TemplateFiles"] as const)
    .filter((t) => input.legacyColumnsPresent[t] && !missingSources.some((m) => m.table === t))
    .map((t) => ({ table: t, column: legacyColumnFor[t] }));

  return {
    renameTemplateTable: input.templateTableExists,
    createBlobTable: !input.blobTableExists,
    addBlobIdColumnTo,
    blobs,
    dropColumns,
    addForeignKeyTo: (["Uploads", "TemplateFiles"] as const).filter((t) => !input.foreignKeysOn[t]),
    setBlobIdNotNullOn: (["Uploads", "TemplateFiles"] as const).filter((t) => !input.notNullOn[t]),
    missingSources,
  };
}

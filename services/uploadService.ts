import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildFileBlobData, XLSX_MIME_TYPE } from "@/lib/fileBlobs";
import { buildZip, putArchive } from "@/lib/errorArchive";
import type { FileErrorGroup, FileReport } from "@/lib/uploadReport";
import {
  buildSpeciesIndex,
  normalizeSpeciesName,
  resolveSpecies,
  type SpeciesMasterEntry,
} from "@/lib/fishSpecies";

// Types
type CellValue = string | number | boolean | Date | null | undefined;
type SheetRow = CellValue[];
type DataObject = Record<string, CellValue>;

// Row where every cell is null, undefined or a blank string.
// Exported for unit tests (see services/uploadService.test.ts, #112).
export const isEmptyRow = (row: SheetRow): boolean =>
  row.every(
    (cell) =>
      cell === null ||
      cell === undefined ||
      (typeof cell === "string" && cell.trim() === ""),
  );

// vereinheitlichen von Strings zum Vergleich
// Exported for unit tests (see services/uploadService.test.ts, #112).
export const normalize = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase();

// Exported for unit tests (see services/uploadService.test.ts, #112).
export function readLists(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets["List"];

  // No List sheet → return empty object; list validation will be skipped
  if (!sheet) return {};

  const rows: SheetRow[] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  }) as SheetRow[];

  const headers = rows[0] as string[];

  if (!headers || headers.length === 0) return {};

  const lists: Record<string, Set<string>> = {};

  for (let c = 0; c < headers.length; c++) {
    const name = normalize(headers[c]);

    const set = new Set<string>();

    for (let r = 1; r < rows.length; r++) {
      const value = rows[r][c];

      if (value) {
        set.add(normalize(value));
      }
    }
    lists[name] = set;
  }
  return lists;
}

//Prüfung der Listen

function inList(lists: Record<string, Set<string>>, listName: string) {
  const set = lists[normalize(listName)];

  // No List sheet or no matching column → accept any non-empty string
  if (!set) {
    return z.string().min(1);
  }

  return z
    .string()
    .min(1)
    .refine((v) => set.has(normalize(v)), {
      message: `Value not found in List sheet: ${listName}`,
    });
}

/**
 * The species column checked against the master in `fish_species` (#80).
 *
 * The uploaded file's own `List` sheet is **not** authoritative for species:
 * it validated the file against itself, which is how a name with a
 * non-breaking space passed the upload and then lost rows at the import.
 */
function inSpeciesMaster(index: Map<string, SpeciesMasterEntry>) {
  return z
    .string({ message: "Species must be a text value" })
    .min(1, { message: "Species is required" })
    .refine((v) => resolveSpecies(index, v) !== undefined, {
      message: "Species is not in the species master (fish_species)",
    });
}

// z.coerce.string() turns undefined/null into "undefined"/"null", and empty
// Excel cells arrive as undefined — map nullish to "" first so min(1) applies (#118).
const emptyIfNullish = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => v ?? "", schema);

//Zod Schema
// Exported for unit tests (see services/uploadService.test.ts, #112).
export function buildSchema(
  lists: Record<string, Set<string>>,
  species?: Map<string, SpeciesMasterEntry>,
) {
  return z
    .object({
      country: inList(lists, "country"),
      river_name: emptyIfNullish(
        z.coerce
          .string({ message: "River name must be a text value" })
          .min(1, { message: "River name is required" }),
      ),
      year: z.coerce
        .number({ message: "Year must be a number" })
        .int({ message: "Year must be a whole number" })
        .min(1990, { message: "Year must be between 1990 and 2100" })
        .max(2100, { message: "Year must be between 1990 and 2100" }),
      data_provider: emptyIfNullish(
        z.coerce
          .string({ message: "Data provider must be a text value" })
          .min(1, { message: "Data provider is required" }),
      ),
      approval_required: z.enum(["yes", "no"], {
        message: "Approval must be 'yes' or 'no'",
      }),
      source: emptyIfNullish(
        z.coerce
          .string({ message: "Source must be a text value" })
          .min(1, { message: "Source is required" }),
      ),
      project: emptyIfNullish(
        z.coerce
          .string({ message: "Project name must be a text value" })
          .max(150, {
            message: "Project name must be less than 150 characters long",
          }),
      ),
      site_name: emptyIfNullish(
        z.coerce
          .string({ message: "Site name must be a text value" })
          .min(1, { message: "Site name is required" }),
      ),
      date: z.coerce.date({ message: "Invalid date format" }),
      fishing_district: z.coerce
        .string({ message: "Fishing district must be a text value" })
        .optional(),
      preclassification_stressor: z.coerce
        .string({ message: "Preclassification stressor must be a text value" })
        .optional(),
      landmark_up: z
        .union([
          z.coerce.string({ message: "Landmark up must be a text value" }),
          z.coerce.number(),
        ])
        .refine((v) => String(v).length <= 100, {
          message: "Landmark up must be at most 100 characters long",
        })
        .optional(),
      lat_up: z.coerce.number({ message: "Latitude up must be a number" }),
      long_up: z.coerce.number({ message: "Longitude up must be a number" }),
      landmark_down: z
        .union([
          z.coerce.string({ message: "Landmark down must be a text value" }),
          z.coerce.number(),
        ])
        .refine((v) => String(v).length <= 100, {
          message: "Landmark down must be at most 100 characters long",
        })
        .optional(),
      lat_down: z.coerce
        .number({ message: "Latitude down must be a number" })
        .optional(),
      long_down: z.coerce
        .number({ message: "Longitude down must be a number" })
        .optional(),
      length_site: z.coerce
        .number({ message: "Length site must be a number" })
        .optional(),
      width_site: z.coerce
        .number({ message: "Width site must be a number" })
        .optional(),
      temp: z.coerce
        .number({ message: "Temperature must be a number" })
        .optional(),
      conductivity: z.coerce
        .number({ message: "Conductivity must be a number" })
        .min(50, { message: "Conductivity must be at least 50" })
        .max(1500, { message: "Conductivity must be at most 1500" })
        .optional(),
      pH_value: z.coerce
        .number({ message: "pH value must be a number" })
        .min(0, { message: "pH value must be at least 0" })
        .max(14, { message: "pH value must be at most 14" })
        .optional(),
      ox_cont: z.coerce
        .number({ message: "Oxygen content must be a number" })
        .min(0, { message: "Oxygen content must be at least 0" })
        .max(20, { message: "Oxygen content must be at most 20" })
        .optional(),
      ox_sat: z.coerce
        .number({ message: "Oxygen saturation must be a number" })
        .min(20, { message: "Oxygen saturation must be at least 20" })
        .max(130, { message: "Oxygen saturation must be at most 130" })
        .optional(),
      mean_water_depth: z.coerce
        .number({ message: "Mean water depth must be a number" })
        .optional(),
      discharge: z.coerce
        .number({ message: "Discharge must be a number" })
        .optional(),
      method: inList(lists, "method"),
      sampling_time: inList(lists, "sampling time"),
      assessment: inList(lists, "assessment"),
      anodes: z.coerce
        .number({ message: "Anodes must be a number" })
        .int({ message: "Anodes must be a whole number" })
        .min(1, { message: "Anodes must be at least 1" })
        .max(10, { message: "Anodes must be at most 10" })
        .optional(),
      fished_length: z.coerce
        .number({ message: "Fished length must be a number" })
        .optional(),
      fished_width: z.coerce
        .number({ message: "Fished width must be a number" })
        .optional(),
      type_of_strip: z.coerce
        .string({ message: "Type of strip must be a text value" })
        .optional(),
      habitat: z.coerce
        .string({ message: "Habitat must be a text value" })
        .optional(),
      sample_id: z.coerce
        .string({ message: "Sample ID must be a text value" })
        .optional(),
      fish_id: z.coerce
        .number({ message: "Fish ID must be a number" })
        .int({ message: "Fish ID must be a whole number" })
        .optional(),
      species: species ? inSpeciesMaster(species) : inList(lists, "name of species"),
      total_length: z.coerce
        .number({ message: "Total length must be a number" })
        .optional(),
      weight: z.coerce
        .number({ message: "Weight must be a number" })
        .optional(),
      reader_id: z.coerce
        .string({ message: "Reader ID must be a text value" })
        .optional(),
      memory_id: z.coerce
        .number({ message: "Memory ID must be a number" })
        .int({ message: "Memory ID must be a whole number" })
        .optional(),
      pit_dec: z.coerce
        .string({ message: "Pit decimal must be a text value" })
        .optional(),
      pit_hex: z.coerce
        .string({ message: "Pit hex must be a text value" })
        .optional(),
      recapture: z.coerce
        .number({ message: "Recapture must be a number" })
        .int({ message: "Recapture must be a whole number" })
        .min(0, { message: "Recapture must be at least 0" })
        .max(1, { message: "Recapture must be at most 1" })
        .optional(),
      catch_efficiency: z.coerce
        .number({ message: "Catch efficiency must be a number" })
        .min(0, { message: "Catch efficiency must be at least 0" })
        .max(100, { message: "Catch efficiency must be at most 100" })
        .optional(),
      remark_raw_data: z.coerce
        .string({ message: "Remark raw data must be a text value" })
        .optional(),
      remark_import: z.coerce
        .string({ message: "Remark import must be a text value" })
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (normalize(data.country) === "austria") {
        if (data.lat_up < 46 || data.lat_up > 49.1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lat_up"],
            message: "Latitude up must be between 46 and 49.1 when in Austria",
          });
        }

        if (data.long_up < 9.5 || data.long_up > 17.4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["long_up"],
            message:
              "Longitude up must be between 9.5 and 17.4 when in Austria",
          });
        }
      }
    });
}

/** Columns every DATA sheet must provide. */
export const REQUIRED_COLUMNS = [
  "country",
  "river_name",
  "year",
  "data_provider",
  "approval_required",
  "source",
  "project",
  "site_name",
  "date",
  "lat_up",
  "long_up",
  "method",
  "sampling_time",
  "assessment",
  "species",
] as const;

/** One uploaded file as it arrives from the API. */
export type BulkUploadFile = {
  fileName: string;
  buffer: Buffer;
};

/** A single validation problem found in a file. */
export type ValidationError = {
  /** 1-based Excel row number (the header row is row 1). */
  row: number;
  /** Column the error belongs to, or `""` for file-level problems. */
  column: string;
  /** The offending cell value (`""` when the cell was empty). */
  value: string;
  /** Human-readable message that names the column and the value. */
  message: string;
};

/** Result of validating one file: structure plus row-level problems. */
export type ValidatedFile = {
  fileName: string;
  buffer: Buffer;
  headers: string[];
  /** Header row plus data rows, cut at the first fully empty row. */
  rows: SheetRow[];
  /** Data rows in the DATA sheet, header excluded (#132). */
  dataRowCount: number;
  errors: ValidationError[];
  /** Set when the file cannot be parsed at all (missing sheet/columns …). */
  structuralError?: { error: string; details: string };
  /** PIT DEC → species, used for the cross-file duplicate check. */
  pitDec: Map<string, { speciesName: string; rowNum: number }>;
};

export type BulkUploadOutcome =
  | {
      success: true;
      report: FileReport[];
      uploads: { id: string; fileName: string; state: string }[];
    }
  | { success: false; report: FileReport[]; zipToken: string };

const cellToText = (value: CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

const withValue = (message: string, value: string): string =>
  value ? `${message} (value: "${value}")` : message;

/** Removes path separators so a client file name is safe to store. */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/]/g, "_").trim() || "upload.xlsx";
}

/**
 * Validates one workbook without touching the database (#88). Pure apart from
 * `XLSX.read`, so a bulk upload can validate every file before writing.
 *
 * `species` is the master from `fish_species` (#80). When it is passed, the
 * species column is checked against it and the file's own `List` sheet is
 * ignored for that column; without it (tests that do not exercise species) the
 * file's list applies.
 */
export function validateWorkbook(
  fileName: string,
  buffer: Buffer,
  species?: Map<string, SpeciesMasterEntry>,
): ValidatedFile {
  const base: ValidatedFile = {
    fileName,
    buffer,
    headers: [],
    rows: [],
    dataRowCount: 0,
    errors: [],
    pitDec: new Map(),
  };

  let workbook: XLSX.WorkBook;
  try {
    // `dense` stores rows as arrays instead of per-cell objects: ~2x faster and
    // ~35% less peak memory on the BOKU bulk (247k rows, #132). Everything here
    // reads sheets through XLSX.utils.sheet_to_json, which supports dense mode.
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      dense: true,
    });
  } catch (error) {
    return {
      ...base,
      structuralError: {
        error: "Unreadable file",
        details: `The file could not be read as an Excel workbook: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }

  const rowSchema = buildSchema(readLists(workbook), species);

  const sheet = workbook.Sheets["DATA"];
  if (!sheet) {
    return {
      ...base,
      structuralError: {
        error: "DATA sheet missing",
        details: "Required 'DATA' sheet is missing in the Excel file",
      },
    };
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
  }) as SheetRow[];

  if (!rows || rows.length === 0) {
    return {
      ...base,
      structuralError: {
        error: "No data found",
        details: "The DATA sheet contains no data",
      },
    };
  }

  const headers = (rows[0] as string[]) ?? [];
  if (!headers || headers.length === 0) {
    return {
      ...base,
      structuralError: {
        error: "No headers found",
        details: "The DATA sheet contains no column headers",
      },
    };
  }

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    return {
      ...base,
      structuralError: {
        error: "Missing required columns",
        details: `Missing required columns: ${missingColumns.join(", ")}`,
      },
    };
  }

  // A missing List sheet used to switch the list validation off silently
  // (`inList` accepts anything without a set), so three June files passed the
  // upload without any species check and failed at the import (#80).
  if (!workbook.Sheets["List"]) {
    return {
      ...base,
      structuralError: {
        error: "List sheet missing",
        details:
          "Required 'List' sheet is missing in the Excel file — the validation lists (country, method, …) cannot be checked without it",
      },
    };
  }

  const errors: ValidationError[] = [];
  // `pitDec` is the per-file index used by the cross-file and database checks
  // (first occurrence wins). `pitByDate` adds the catch date: one file is a
  // delivery for a river over many dates, so the same tag may legitimately
  // reappear on a later date (recapture). Twice on the same date is a copy
  // error (#80, #184).
  const pitDec = new Map<string, { speciesName: string; rowNum: number }>();
  const pitByDate = new Map<string, { speciesName: string; rowNum: number }>();
  // A PIT can appear three times; the earlier row must not collect one error
  // per later occurrence.
  const flaggedPitRows = new Set<string>();
  let end = rows.length;

  const flagPit = (
    rowNum: number,
    pitDecValue: string,
    message: string,
  ): void => {
    const key = `${rowNum}\u0000${pitDecValue}`;
    if (flaggedPitRows.has(key)) return;
    flaggedPitRows.add(key);
    errors.push({ row: rowNum, column: "pit_dec", value: pitDecValue, message });
  };

  const dateKey = (value: CellValue): string =>
    value instanceof Date ? value.toISOString().slice(0, 10) : cellToText(value);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Stop at the first fully empty row (trailing blanks are common).
    if (isEmptyRow(row)) {
      end = i;
      break;
    }

    const obj: DataObject = {};
    headers.forEach((h: string, idx: number) => {
      obj[h] = row[idx];
    });

    const result = rowSchema.safeParse(obj);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const column = String(issue.path[0] ?? "");
        const columnIndex = headers.indexOf(column);
        if (columnIndex === -1) continue;
        const value = cellToText(row[columnIndex]);
        errors.push({
          row: i + 1,
          column,
          value,
          message: withValue(issue.message, value),
        });
      }
    }

    const pitDecValue = obj["pit_dec"] ? String(obj["pit_dec"]).trim() : "";
    const speciesName = obj["species"] ? String(obj["species"]).trim() : "";

    if (pitDecValue && speciesName) {
      const date = dateKey(obj["date"]);
      const existing = pitByDate.get(`${pitDecValue}\u0000${date}`);

      if (existing) {
        // Same tag on the same date is a copy error, with the same species or
        // not; on a different date it is a legitimate recapture (#184).
        const sameSpecies =
          normalizeSpeciesName(existing.speciesName) ===
          normalizeSpeciesName(speciesName);
        const tail = sameSpecies
          ? "a PIT tag is unique per sampling."
          : `a PIT tag always belongs to the same individual — the rows name different species (row ${existing.rowNum}: ${existing.speciesName}, row ${i + 1}: ${speciesName}).`;

        // Both rows are marked, each pointing at the other occurrence.
        flagPit(
          existing.rowNum,
          pitDecValue,
          `PIT DEC ${pitDecValue} already appears in row ${i + 1} of this file with the same catch date (${date}); ${tail}`,
        );
        flagPit(
          i + 1,
          pitDecValue,
          `PIT DEC ${pitDecValue} already appears in row ${existing.rowNum} of this file with the same catch date (${date}); ${tail}`,
        );
      } else {
        pitByDate.set(`${pitDecValue}\u0000${date}`, {
          speciesName,
          rowNum: i + 1,
        });
      }

      // Cross-file and database checks work per tag, not per date.
      if (!pitDec.has(pitDecValue)) {
        pitDec.set(pitDecValue, { speciesName, rowNum: i + 1 });
      }
    }
  }

  return {
    ...base,
    headers,
    rows: rows.slice(0, end),
    dataRowCount: Math.max(end - 1, 0),
    errors,
    pitDec,
  };
}

/**
 * Flags a PIT DEC that appears with different species *across* the files of
 * one bulk (#88). Both affected files get an error.
 */
export function crossFilePitCheck(files: ValidatedFile[]): void {
  const seen = new Map<
    string,
    { file: ValidatedFile; speciesName: string; rowNum: number }
  >();

  for (const file of files) {
    if (file.structuralError) continue;

    for (const [pitDec, info] of file.pitDec) {
      const prior = seen.get(pitDec);
      if (!prior) {
        seen.set(pitDec, {
          file,
          speciesName: info.speciesName,
          rowNum: info.rowNum,
        });
        continue;
      }

      if (prior.speciesName !== info.speciesName) {
        prior.file.errors.push({
          row: prior.rowNum,
          column: "pit_dec",
          value: pitDec,
          message: `PIT DEC ${pitDec} occurs with different species in file "${file.fileName}" (row ${info.rowNum}: ${info.speciesName}). It must always have the same species.`,
        });
        file.errors.push({
          row: info.rowNum,
          column: "pit_dec",
          value: pitDec,
          message: `PIT DEC ${pitDec} occurs with different species in file "${prior.file.fileName}" (row ${prior.rowNum}: ${prior.speciesName}). It must always have the same species.`,
        });
      }
    }
  }
}

/** PIT tags per lookup: a 13-file cutover has ~10⁴ distinct tags. */
const PIT_LOOKUP_BATCH = 500;

/**
 * Checks the PIT DEC species of every file against already stored catches.
 *
 * One batched lookup for the whole bulk instead of one query per tag (#80),
 * and no `recapture: false` filter — a PIT belongs to the same individual
 * whether or not an earlier catch was itself a recapture (#184).
 */
async function applyDbPitChecks(files: ValidatedFile[]): Promise<void> {
  const hits = new Map<
    string,
    { file: ValidatedFile; rowNum: number; speciesName: string }[]
  >();

  for (const file of files) {
    if (file.structuralError) continue;

    for (const [pitDec, info] of file.pitDec) {
      const list = hits.get(pitDec) ?? [];
      list.push({ file, rowNum: info.rowNum, speciesName: info.speciesName });
      hits.set(pitDec, list);
    }
  }

  const tags = [...hits.keys()];
  if (tags.length === 0) return;

  const stored = new Map<string, string>(); // pitDec -> species name in the DB
  for (let i = 0; i < tags.length; i += PIT_LOOKUP_BATCH) {
    const batch = tags.slice(i, i + PIT_LOOKUP_BATCH);
    try {
      const rows = await prisma.fishCatch.findMany({
        where: { pitDec: { in: batch } },
        select: { pitDec: true, species: { select: { speciesName: true } } },
        distinct: ["pitDec"],
      });

      for (const row of rows) {
        if (row.pitDec && !stored.has(row.pitDec)) {
          stored.set(row.pitDec, row.species.speciesName);
        }
      }
    } catch (dbError) {
      console.error("DB error while checking PIT DEC:", dbError);
      for (const pitDec of batch) {
        for (const hit of hits.get(pitDec) ?? []) {
          hit.file.errors.push({
            row: hit.rowNum,
            column: "pit_dec",
            value: pitDec,
            message: "Could not check PIT DEC against the database.",
          });
        }
      }
    }
  }

  for (const [pitDec, list] of hits) {
    const storedSpecies = stored.get(pitDec);
    if (storedSpecies === undefined) continue;

    for (const hit of list) {
      if (
        normalizeSpeciesName(storedSpecies) ===
        normalizeSpeciesName(hit.speciesName)
      ) {
        continue;
      }

      hit.file.errors.push({
        row: hit.rowNum,
        column: "pit_dec",
        value: pitDec,
        message: `PIT DEC ${pitDec} already exists in the database with a different species (${storedSpecies}); a PIT tag always belongs to the same individual.`,
      });
    }
  }
}

/** Groups identical errors (same column, value and message) into one entry. */
export function groupErrors(errors: ValidationError[]): FileErrorGroup[] {
  const groups = new Map<string, FileErrorGroup>();

  for (const error of errors) {
    const key = `${error.column}\u0000${error.value}\u0000${error.message}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(error.row);
    } else {
      groups.set(key, {
        column: error.column,
        value: error.value,
        message: error.message,
        rows: [error.row],
      });
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    rows: [...group.rows].sort((a, b) => a - b),
  }));
}

/** Turns a validated file into its report entry. */
export function buildFileReport(file: ValidatedFile): FileReport {
  if (file.structuralError) {
    return {
      fileName: file.fileName,
      status: "failed",
      totalRows: 0,
      passedRows: 0,
      failedRows: 0,
      errors: [
        {
          column: "-",
          value: "",
          message: file.structuralError.details,
          rows: [],
        },
      ],
    };
  }

  const failedRows = new Set(file.errors.map((error) => error.row));
  const totalRows = file.dataRowCount;

  return {
    fileName: file.fileName,
    status: file.errors.length > 0 ? "failed" : "passed",
    totalRows,
    passedRows: totalRows - failedRows.size,
    failedRows: failedRows.size,
    errors: groupErrors(file.errors),
  };
}

/**
 * Re-reads the DATA rows of a workbook for annotation (#132). Only the failure
 * path needs row data: rows are dropped after validation so that a large bulk
 * does not hold every workbook in memory.
 *
 * Exported for unit tests.
 */
export function readDataRowsForAnnotation(buffer: Buffer): SheetRow[] {
  try {
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      dense: true,
    });
    const sheet = workbook.Sheets["DATA"];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
    }) as SheetRow[];
  } catch {
    // Unreadable workbooks are returned unchanged by buildAnnotatedWorkbook.
    return [];
  }
}

/** Restores the rows an annotated (failed) workbook needs. */
function withRowsForAnnotation(file: ValidatedFile): ValidatedFile {
  if (file.structuralError || file.errors.length === 0 || file.rows.length > 0) {
    return file;
  }
  return { ...file, rows: readDataRowsForAnnotation(file.buffer) };
}

/**
 * Rebuilds the workbook with the offending cells highlighted (red fill +
 * note), as the download users get on a failed upload. Files with only
 * structural problems are returned unchanged — there is nothing to mark.
 */
export async function buildAnnotatedWorkbook(
  file: ValidatedFile,
): Promise<Buffer> {
  if (file.structuralError || file.errors.length === 0) {
    return file.buffer;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("DATA");

  sheet.addRow(file.headers);
  for (let i = 1; i < file.rows.length; i++) {
    sheet.addRow(file.rows[i]);
  }

  for (const error of file.errors) {
    const columnIndex = file.headers.indexOf(error.column);
    if (columnIndex === -1) continue;

    const cell = sheet.getCell(error.row, columnIndex + 1);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFF9999" }, // light red
    };
    cell.font = {
      color: { argb: "FFCC0000" }, // dark red
      bold: true,
    };
    cell.note = error.message;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Validates and stores a bulk upload (1..N files, #88).
 *
 * All-or-nothing: every file is validated first (read-only), then — only when
 * no file has an error — all files and their `Uploads` rows are written in a
 * single transaction. A failure writes nothing and returns a report plus a
 * token for the annotated error ZIP.
 */
export async function processBulkUpload(
  files: BulkUploadFile[],
  userId: string,
): Promise<BulkUploadOutcome> {
  // The species master is the authority for the `species` column (#80); it is
  // loaded once for the whole bulk and passed to every file's validation.
  const speciesRows = await prisma.fishSpecies.findMany({
    select: { id: true, speciesName: true },
  });
  const speciesIndex = buildSpeciesIndex(speciesRows);

  // Row data is only needed to count rows and to annotate a FAILED workbook, so
  // it is released as soon as each file is validated (#132). Keeping every
  // workbook's rows alive made a 14-file / 247k-row bulk cost ~1.6 GB RSS on a
  // 3.8 GB host; the failure path re-reads the affected files instead.
  const validated: ValidatedFile[] = files.map((file) => {
    const result = validateWorkbook(file.fileName, file.buffer, speciesIndex);
    return { ...result, rows: [] };
  });

  crossFilePitCheck(validated);
  // Runs regardless of other errors so PIT conflicts are reported in the same round (#102).
  await applyDbPitChecks(validated);

  const report = validated.map(buildFileReport);

  const failed = validated.filter(
    (file) => file.structuralError || file.errors.length > 0,
  );

  if (failed.length > 0) {
    const entries = await Promise.all(
      failed.map(async (file) => ({
        fileName: file.fileName,
        data: await buildAnnotatedWorkbook(withRowsForAnnotation(file)),
      })),
    );
    return { success: false, report, zipToken: putArchive(await buildZip(entries)) };
  }

  // One transaction for the whole bulk: every blob and every upload row, or
  // nothing at all (#88).
  const uploads = await prisma.$transaction(
    validated.map((file) =>
      prisma.uploads.create({
        data: {
          user: { connect: { id: userId } },
          state: "UPLOADED",
          blob: {
            create: buildFileBlobData({
              fileName: sanitizeFileName(file.fileName),
              mimeType: XLSX_MIME_TYPE,
              data: file.buffer,
            }),
          },
        },
        include: { blob: { select: { fileName: true } } },
      }),
    ),
  );

  return {
    success: true,
    report,
    uploads: uploads.map((upload) => ({
      id: upload.id,
      fileName: upload.blob.fileName,
      state: upload.state,
    })),
  };
}

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the Excel-upload validation and the bulk pipeline (#112, #88).
// Prisma is mocked; workbooks are built in memory, nothing is stored.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    fishCatch: { findFirst: vi.fn(), findMany: vi.fn() },
    fishSpecies: { findMany: vi.fn() },
    imports: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// The write path is its own unit (services/importService.test.ts, and the
// end-to-end fixture in services/uploadPipeline.test.ts); here it is stubbed so
// these tests stay about validation and the bulk decision.
vi.mock("@/services/importService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/importService")>()),
  writeImports: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getArchive } from "@/lib/errorArchive";
import { buildSpeciesIndex } from "@/lib/fishSpecies";
import { writeImports, fileHash } from "@/services/importService";
import {
  buildAnnotatedWorkbook,
  buildSchema,
  buildFileReport,
  groupErrors,
  isEmptyRow,
  normalize,
  processBulkUpload,
  readLists,
  sanitizeFileName,
  validateWorkbook,
} from "@/services/uploadService";

const validRow = {
  country: "Austria",
  river_name: "Danube",
  year: 2024,
  data_provider: "BOKU",
  approval_required: "yes",
  source: "field survey",
  project: "CatchLogX",
  site_name: "Site A",
  date: new Date("2024-05-01"),
  lat_up: 48.2,
  long_up: 16.3,
  method: "boat",
  sampling_time: "day",
  assessment: "good",
  species: "Brown trout",
};

// --- workbook helpers -------------------------------------------------------

type Row = Record<string, unknown>;
const headers = [...Object.keys(validRow), "pit_dec", "recapture"];

function toCells(row: Row) {
  return headers.map((h) => {
    const value = row[h];
    return value instanceof Date ? value.toISOString().slice(0, 10) : value;
  });
}

function buildWorkbook(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function dataFile(rows: Row[], extraSheets: Record<string, unknown[][]> = {}) {
  return buildWorkbook({
    DATA: [headers, ...rows.map(toCells)],
    // Most real files carry a List sheet; where it is missing the list checks
    // are skipped (#213), so the helper writes one by default.
    List: [["country"], ["Austria"]],
    ...extraSheets,
  });
}

async function readErrorNotes(fileBuffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuffer as unknown as ArrayBuffer);
  const notes: Record<string, string> = {};
  wb.getWorksheet("DATA")!.eachRow((row, rowNumber) => {
    // includeEmpty: notes on empty cells (missing values) must be found too
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (cell.note) notes[`${rowNumber}:${headers[colNumber - 1]}`] = String(cell.note);
    });
  });
  return notes;
}

// The species master the validator checks against (#80). `validRow` uses
// "Brown trout"; "Pike" exists so a PIT/species mismatch can be expressed.
const masterSpecies = [
  { id: 1, speciesName: "Brown trout" },
  { id: 2, speciesName: "Pike" },
];
const speciesIndex = buildSpeciesIndex(masterSpecies);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([]);
  vi.mocked(prisma.fishSpecies.findMany).mockResolvedValue(masterSpecies as any);
  vi.mocked(prisma.imports.findMany).mockResolvedValue([]);
  vi.mocked(writeImports).mockImplementation((async (files: any[]) => ({
    imports: files.map((file) => ({
      id: `imp-${file.fileName}`,
      fileName: file.fileName,
      rowCount: 1,
      createdAt: new Date("2026-11-15T10:00:00Z"),
    })),
    samplings: files.length,
    catches: files.length,
  })) as any);
});

// --- pure helpers -----------------------------------------------------------

describe("normalize", () => {
  it("trims and lowercases strings", () => {
    expect(normalize("  Austria  ")).toBe("austria");
  });

  it("handles nullish values", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});

describe("isEmptyRow", () => {
  it("detects rows with only blank cells", () => {
    expect(isEmptyRow([null, undefined, "  "])).toBe(true);
    expect(isEmptyRow(["x", null])).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("strips path separators and falls back for blanks", () => {
    expect(sanitizeFileName("a/b\\c.xlsx")).toBe("a_b_c.xlsx");
    expect(sanitizeFileName("   ")).toBe("upload.xlsx");
  });
});

describe("readLists / buildSchema", () => {
  it("builds the schema from the List sheet", () => {
    const wb = XLSX.read(
      buildWorkbook({ List: [["country"], ["Austria"]] }),
      { type: "buffer" },
    );
    const lists = readLists(wb);
    const valid = buildSchema(lists).safeParse({ ...validRow, country: "Austria" });
    const invalid = buildSchema(lists).safeParse({
      ...validRow,
      country: "Atlantis",
    });
    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  // #182: the template lists `project` as mandatory, but the schema only had
  // `.max(150)` and let empty cells through.
  it("rejects an empty project cell (#182)", () => {
    const schema = buildSchema({});

    expect(schema.safeParse(validRow).success).toBe(true);
    expect(schema.safeParse({ ...validRow, project: undefined }).success).toBe(
      false,
    );

    const blank = schema.safeParse({ ...validRow, project: "" });
    expect(blank.success).toBe(false);
    if (!blank.success) {
      expect(blank.error.issues[0]).toMatchObject({
        path: ["project"],
        message: "Project name is required",
      });
    }
  });
});

// --- validateWorkbook -------------------------------------------------------

describe("validateWorkbook", () => {
  it("accepts a well-formed file", () => {
    const file = validateWorkbook("ok.xlsx", dataFile([validRow]));
    expect(file.structuralError).toBeUndefined();
    expect(file.errors).toEqual([]);
    expect(file.rows).toHaveLength(2);
  });

  it("reports a missing DATA sheet as a structural error", () => {
    const file = validateWorkbook(
      "x.xlsx",
      buildWorkbook({ Other: [["a"], ["b"]] }),
    );
    expect(file.structuralError?.details).toMatch(/DATA/);
  });

  it("lists every missing required column", () => {
    const file = validateWorkbook(
      "x.xlsx",
      buildWorkbook({ DATA: [["country", "river_name"], ["Austria", "Danube"]] }),
    );
    expect(file.structuralError?.details).toContain("year");
    expect(file.structuralError?.details).toContain("species");
    expect(file.structuralError?.details).not.toContain("river_name");
  });

  it("flags an invalid cell with the column, the value and a message", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([validRow, { ...validRow, year: 1800 }]),
    );
    expect(file.errors).toHaveLength(1);
    expect(file.errors[0]).toMatchObject({ row: 3, column: "year", value: "1800" });
    expect(file.errors[0].message).toContain("Year must be between 1990 and 2100");
    expect(file.errors[0].message).toContain('(value: "1800")');
  });

  it("flags empty required cells (#118)", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([validRow, { ...validRow, river_name: undefined }]),
    );
    expect(file.errors[0]).toMatchObject({ row: 3, column: "river_name", value: "" });
    expect(file.errors[0].message).toBe("River name is required");
  });

  it("stops validating at the first empty row", () => {
    const file = validateWorkbook(
      "x.xlsx",
      buildWorkbook({
        DATA: [
          headers,
          toCells(validRow),
          headers.map(() => ""),
          toCells({ ...validRow, year: 1800 }),
        ],
        List: [["country"], ["Austria"]],
      }),
    );
    expect(file.errors).toEqual([]);
    expect(file.rows).toHaveLength(2);
  });

  it("flags a PIT tag used for two different species in one file", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([
        { ...validRow, pit_dec: "123" },
        { ...validRow, pit_dec: "123", species: "Pike" },
      ]),
    );
    // Both rows are marked: a PIT tag is unique, so the second occurrence is
    // as wrong as the first (#80).
    expect(file.errors).toHaveLength(2);
    expect(file.errors[0]).toMatchObject({ row: 2, column: "pit_dec", value: "123" });
    expect(file.errors[1]).toMatchObject({ row: 3, column: "pit_dec", value: "123" });
    expect(file.errors[1].message).toMatch(/PIT DEC 123.*row 2.*different species.*Brown trout/);
  });

  it("flags the same PIT tag twice in one file, even with the same species", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([
        { ...validRow, pit_dec: "123" },
        { ...validRow, pit_dec: "123" },
      ]),
    );
    expect(file.errors).toHaveLength(2);
    expect(file.errors[0]).toMatchObject({ row: 2, column: "pit_dec", value: "123" });
    expect(file.errors[1]).toMatchObject({ row: 3, column: "pit_dec", value: "123" });
    // Both rows point at the other occurrence; the later row carries the
    // "unique" wording.
    expect(file.errors[0].message).toMatch(/PIT DEC 123 already appears in row 3 of this file/);
    expect(file.errors[1].message).toMatch(/PIT DEC 123 already appears in row 2 of this file/);
    expect(file.errors[1].message).toMatch(/a PIT tag is unique per sampling/);
  });

  it("accepts the same PIT tag on a different catch date (recapture)", () => {
    // One file is a delivery for a river over many dates; the same individual
    // may be caught again later — only the same date is a copy error (#184).
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([
        { ...validRow, pit_dec: "123", date: new Date("2024-05-01") },
        { ...validRow, pit_dec: "123", date: new Date("2024-06-01") },
      ]),
      speciesIndex,
    );

    expect(file.errors).toEqual([]);
  });

  it("rejects a species that is not in the master, with the row and the value", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([validRow, { ...validRow, species: "Neogobius sp." }]),
      speciesIndex,
    );

    expect(file.errors).toHaveLength(1);
    expect(file.errors[0]).toMatchObject({
      row: 3,
      column: "species",
      value: "Neogobius sp.",
    });
    expect(file.errors[0].message).toMatch(/not in the species master/);
  });

  it("names every unknown species, not just the first", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([
        { ...validRow, species: "Ballerus sp." },
        validRow,
        { ...validRow, species: "Salvelinus namaycush" },
        { ...validRow, species: "Ballerus sp." },
      ]),
      speciesIndex,
    );

    const groups = groupErrors(file.errors);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => [g.value, g.rows])).toEqual([
      ["Ballerus sp.", [2, 5]],
      ["Salvelinus namaycush", [4]],
    ]);
  });

  it("matches the master tolerantly (NBSP, trailing spaces, case)", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([
        { ...validRow, species: "Brown\u00A0trout" },
        { ...validRow, species: "  brown trout   " },
      ]),
      speciesIndex,
    );

    expect(file.errors).toEqual([]);
  });

  it("ignores the file's own List sheet for species when a master is given", () => {
    // The file claims "Unlisted fish" is a species; the master does not.
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([{ ...validRow, species: "Unlisted fish" }], {
        List: [
          ["country", "name of species"],
          ["Austria", "Unlisted fish"],
        ],
      }),
      speciesIndex,
    );

    expect(file.errors).toHaveLength(1);
    expect(file.errors[0].message).toMatch(/not in the species master/);
  });

  it("accepts a file without a List sheet and skips the list checks", () => {
    // The List sheet only carries the Excel dropdowns; it is not a precondition
    // for the import (#213). Without one, country/method/… are free text — the
    // species is still checked against the master.
    const file = validateWorkbook(
      "x.xlsx",
      buildWorkbook({
        DATA: [headers, toCells({ ...validRow, country: "Nowhere" })],
      }),
      speciesIndex,
    );

    expect(file.structuralError).toBeUndefined();
    expect(file.dataRowCount).toBe(1);
    expect(file.errors).toEqual([]);
  });
});

// --- reporting --------------------------------------------------------------

describe("groupErrors", () => {
  it("groups identical errors and collects the affected rows", () => {
    const groups = groupErrors([
      { row: 5, column: "species", value: "Walli", message: "Unknown species" },
      { row: 3, column: "species", value: "Walli", message: "Unknown species" },
      { row: 4, column: "year", value: "1800", message: "Bad year" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ column: "species", value: "Walli", rows: [3, 5] });
    expect(groups[1]).toMatchObject({ column: "year", rows: [4] });
  });
});

describe("buildFileReport", () => {
  it("counts passed and failed rows", () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([validRow, { ...validRow, year: 1800 }, { ...validRow, site_name: "B" }]),
    );
    const report = buildFileReport(file);
    expect(report).toMatchObject({
      fileName: "x.xlsx",
      status: "failed",
      totalRows: 3,
      passedRows: 2,
      failedRows: 1,
    });
  });

  it("marks a clean file as passed", () => {
    const report = buildFileReport(
      validateWorkbook("ok.xlsx", dataFile([validRow])),
    );
    expect(report).toMatchObject({ status: "passed", passedRows: 1, failedRows: 0 });
  });

  it("surfaces a structural error as a single file-level entry", () => {
    const report = buildFileReport(
      validateWorkbook("x.xlsx", buildWorkbook({ Other: [["a"]] })),
    );
    expect(report.status).toBe("failed");
    expect(report.errors[0]).toMatchObject({ column: "-" });
  });
});

describe("buildAnnotatedWorkbook", () => {
  it("highlights the failing cells with a note", async () => {
    const file = validateWorkbook(
      "x.xlsx",
      dataFile([validRow, { ...validRow, year: 1800 }]),
    );
    const annotated = await buildAnnotatedWorkbook(file);
    expect(await readErrorNotes(annotated)).toEqual({
      "3:year": 'Year must be between 1990 and 2100 (value: "1800")',
    });
  });

  it("returns a structurally broken file unchanged", async () => {
    const buffer = buildWorkbook({ Other: [["a"]] });
    const file = validateWorkbook("x.xlsx", buffer);
    expect(await buildAnnotatedWorkbook(file)).toBe(buffer);
  });
});

// --- processBulkUpload ------------------------------------------------------

describe("processBulkUpload", () => {
  it("validates every file and hands the clean bulk to the import", async () => {
    const files = [
      { fileName: "a.xlsx", buffer: dataFile([validRow]) },
      { fileName: "b.xlsx", buffer: dataFile([{ ...validRow, site_name: "B" }]) },
    ];

    const result = await processBulkUpload(files, "u1");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.report.map((r) => r.status)).toEqual(["passed", "passed"]);
    expect(result.imports.map((i) => i.fileName)).toEqual(["a.xlsx", "b.xlsx"]);
    expect(result.samplings).toBe(2);
    expect(result.catches).toBe(2);
    // One transaction for the whole bulk is the import service's job (#202).
    expect(writeImports).toHaveBeenCalledOnce();
    expect(writeImports).toHaveBeenCalledWith(
      [
        { fileName: "a.xlsx", buffer: files[0].buffer },
        { fileName: "b.xlsx", buffer: files[1].buffer },
      ],
      "u1",
      undefined,
      expect.anything(),
    );
  });

  it("persists nothing when one file is invalid", async () => {
    const files = [
      { fileName: "good.xlsx", buffer: dataFile([validRow]) },
      { fileName: "bad.xlsx", buffer: dataFile([{ ...validRow, year: 1800 }]) },
    ];

    const result = await processBulkUpload(files, "u1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report.map((r) => r.status)).toEqual(["passed", "failed"]);
    expect(result.zipToken).toBeTruthy();
    // The whole bulk is rejected: nothing is imported.
    expect(writeImports).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes an earlier import already holds", async () => {
    const buffer = dataFile([validRow]);
    vi.mocked(prisma.imports.findMany).mockResolvedValue([
      {
        id: "imp-old",
        fileName: "a.xlsx",
        fileHash: fileHash(buffer),
        createdAt: new Date("2026-11-01T00:00:00Z"),
      },
    ] as any);

    const result = await processBulkUpload([{ fileName: "a.xlsx", buffer }], "u1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report[0].errors[0]).toMatchObject({ column: "-" });
    expect(result.report[0].errors[0].message).toMatch(/already imported on 2026-11-01/);
    expect(writeImports).not.toHaveBeenCalled();
  });

  // A deleted import is a deleted row now (#184), so there is no `deletedAt`
  // filter left in the hash check that could drift out of sync.
  it("checks the file hash against every import, without a deletion filter", async () => {
    const buffer = dataFile([validRow]);

    await processBulkUpload([{ fileName: "a.xlsx", buffer }], "u1");

    const call = vi.mocked(prisma.imports.findMany).mock.calls[0][0]!;
    expect(call.where).toEqual({ fileHash: { in: [fileHash(buffer)] } });
  });

  it("rejects the same file twice in one bulk", async () => {
    const buffer = dataFile([validRow]);

    const result = await processBulkUpload(
      [
        { fileName: "a.xlsx", buffer },
        { fileName: "a-copy.xlsx", buffer },
      ],
      "u1",
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report[1].errors[0].message).toMatch(/Identical file to "a.xlsx"/);
    expect(writeImports).not.toHaveBeenCalled();
  });

  it("propagates a write failure (nothing half-written)", async () => {
    vi.mocked(writeImports).mockRejectedValueOnce(new Error("database down"));

    await expect(
      processBulkUpload(
        [{ fileName: "a.xlsx", buffer: dataFile([validRow]) }],
        "u1",
      ),
    ).rejects.toThrow("database down");
  });

  it("loads the species master once and rejects a file with an unknown species", async () => {
    const result = await processBulkUpload(
      [
        { fileName: "a.xlsx", buffer: dataFile([validRow]) },
        { fileName: "b.xlsx", buffer: dataFile([{ ...validRow, species: "Ballerus sp." }]) },
      ],
      "u1",
    );

    expect(prisma.fishSpecies.findMany).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report.map((r) => r.status)).toEqual(["passed", "failed"]);
    expect(result.report[1].errors[0].message).toMatch(/not in the species master.*Ballerus sp\./);
    // A file with an unknown species imports nothing — not even the good file.
    expect(writeImports).not.toHaveBeenCalled();
  });

  it("puts only the failed files in the error archive", async () => {
    const files = [
      { fileName: "good.xlsx", buffer: dataFile([validRow]) },
      { fileName: "bad.xlsx", buffer: dataFile([{ ...validRow, year: 1800 }]) },
    ];

    const result = await processBulkUpload(files, "u1");
    if (result.success) throw new Error("expected failure");

    const archive = getArchive(result.zipToken);
    expect(archive).not.toBeNull();

    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(archive!);
    expect(Object.keys(zip.files)).toEqual(["bad.xlsx"]);
  });

    it("runs the database PIT check even when the bulk has other errors (#102)", async () => {
    vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([
      { pitDec: "123", species: { speciesName: "Pike" } },
    ] as any);

    const files = [
      { fileName: "bad.xlsx", buffer: dataFile([{ ...validRow, year: 1800, pit_dec: "123" }]) },
    ];

    const result = await processBulkUpload(files, "u1");

    // One lookup for the whole bulk, and no `recapture: false` filter: a PIT
    // belongs to the same individual whether or not it was a recapture (#184).
    expect(prisma.fishCatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pitDec: { in: ["123"] } } }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.report[0].errors.some((e) => /already exists.*\(Pike\)/.test(e.message)),
    ).toBe(true);
  });

  it("flags a PIT DEC shared across two files with different species", async () => {
    const files = [
      { fileName: "a.xlsx", buffer: dataFile([{ ...validRow, pit_dec: "123" }]) },
      {
        fileName: "b.xlsx",
        buffer: dataFile([{ ...validRow, pit_dec: "123", species: "Pike" }]),
      },
    ];

    const result = await processBulkUpload(files, "u1");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report[0].status).toBe("failed");
    expect(result.report[1].status).toBe("failed");
    expect(result.report[0].errors[0].message).toMatch(/different species in file "b.xlsx"/);
    expect(writeImports).not.toHaveBeenCalled();
  });

  it("flags a PIT DEC already stored with another species", async () => {
    vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([
      { pitDec: "123", species: { speciesName: "Pike" } },
    ] as any);

    const result = await processBulkUpload(
      [{ fileName: "a.xlsx", buffer: dataFile([{ ...validRow, pit_dec: "123" }]) }],
      "u1",
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report[0].errors[0].message).toMatch(/already exists.*\(Pike\)/);
    expect(result.report[0].errors[0].message).toMatch(/always belongs to the same individual/);
  });

  it("accepts a known PIT tag of the same species marked as recapture", async () => {
    vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([
      { pitDec: "123", species: { speciesName: "Brown trout" } },
    ] as any);

    const result = await processBulkUpload(
      [
        {
          fileName: "a.xlsx",
          buffer: dataFile([{ ...validRow, pit_dec: "123", recapture: 1 }]),
        },
      ],
      "u1",
    );
    expect(result.success).toBe(true);
  });

  it("flags a known PIT tag of the same species without recapture = 1 (#102)", async () => {
    vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([
      { pitDec: "123", species: { speciesName: "Brown trout" } },
    ] as any);

    const result = await processBulkUpload(
      [
        {
          fileName: "a.xlsx",
          buffer: dataFile([
            { ...validRow, pit_dec: "123", date: new Date("2024-05-01") },
            { ...validRow, pit_dec: "123", date: new Date("2024-06-01"), recapture: 0 },
          ]),
        },
      ],
      "u1",
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    const group = result.report[0].errors.find((e) =>
      /must be marked as a recapture/.test(e.message),
    );
    expect(group?.rows).toEqual([2, 3]);
  });

});

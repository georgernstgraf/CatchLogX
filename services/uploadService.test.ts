import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the Excel-upload validation and the bulk pipeline (#112, #88).
// Prisma is mocked; workbooks are built in memory, nothing is stored.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    fishCatch: { findFirst: vi.fn() },
    uploads: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { getArchive } from "@/lib/errorArchive";
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
const headers = [...Object.keys(validRow), "pit_dec"];

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.$transaction).mockImplementation((async (ops: any) =>
    Promise.all(ops)) as any);
  vi.mocked(prisma.uploads.create).mockImplementation((async ({
    data,
  }: any) => ({
    id: `up-${data.blob.create.fileName}`,
    state: data.state,
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    blob: { fileName: data.blob.create.fileName },
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
    expect(file.errors).toHaveLength(1);
    expect(file.errors[0]).toMatchObject({ row: 3, column: "pit_dec", value: "123" });
    expect(file.errors[0].message).toMatch(/PIT DEC 123.*row 2.*Brown trout/);
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
  it("stores every file of a clean bulk in one transaction", async () => {
    const files = [
      { fileName: "a.xlsx", buffer: dataFile([validRow]) },
      { fileName: "b.xlsx", buffer: dataFile([{ ...validRow, site_name: "B" }]) },
    ];

    const result = await processBulkUpload(files, "u1");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.report.map((r) => r.status)).toEqual(["passed", "passed"]);
    expect(result.uploads.map((u) => u.fileName)).toEqual(["a.xlsx", "b.xlsx"]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.uploads.create).toHaveBeenCalledTimes(2);
    expect(prisma.uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: { connect: { id: "u1" } },
          state: "UPLOADED",
          blob: {
            create: expect.objectContaining({ fileName: "a.xlsx" }),
          },
        }),
      }),
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
    // The whole bulk is rejected: no transaction, no upload rows.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.uploads.create).not.toHaveBeenCalled();
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

  it("skips the database PIT check while the bulk has errors", async () => {
    const files = [
      { fileName: "bad.xlsx", buffer: dataFile([{ ...validRow, year: 1800, pit_dec: "123" }]) },
    ];

    await processBulkUpload(files, "u1");

    expect(prisma.fishCatch.findFirst).not.toHaveBeenCalled();
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
    expect(prisma.uploads.create).not.toHaveBeenCalled();
  });

  it("flags a PIT DEC already stored with another species", async () => {
    vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue({
      species: { speciesName: "Pike" },
    } as any);

    const result = await processBulkUpload(
      [{ fileName: "a.xlsx", buffer: dataFile([{ ...validRow, pit_dec: "123" }]) }],
      "u1",
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report[0].errors[0].message).toMatch(/already exists.*\(Pike\)/);
  });

  it("accepts a known PIT tag of the same species", async () => {
    vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue({
      species: { speciesName: "Brown trout" },
    } as any);

    const result = await processBulkUpload(
      [{ fileName: "a.xlsx", buffer: dataFile([{ ...validRow, pit_dec: "123" }]) }],
      "u1",
    );
    expect(result.success).toBe(true);
  });

  it("propagates a write failure (nothing half-written)", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error("database down"));

    await expect(
      processBulkUpload(
        [{ fileName: "a.xlsx", buffer: dataFile([validRow]) }],
        "u1",
      ),
    ).rejects.toThrow("database down");
  });
});

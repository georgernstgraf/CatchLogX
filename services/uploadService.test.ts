import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the Excel-upload validation (#112).
// Prisma and MinIO are mocked: workbooks are built in memory, nothing is stored.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    fishCatch: { findFirst: vi.fn() },
    uploads: { create: vi.fn() },
  },
}));
vi.mock("@/lib/minio", () => ({ uploadUploadFile: vi.fn() }));

import { uploadUploadFile } from "@/lib/minio";
import { prisma } from "@/lib/prisma";
import {
  buildSchema,
  isEmptyRow,
  normalize,
  processUpload,
  readLists,
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

async function readErrorNotes(fileBuffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fileBuffer);
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
  vi.mocked(prisma.uploads.create).mockImplementation((async ({
    data,
  }: any) => ({
    id: "up1",
    link: data.link,
    state: data.state,
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as any);
});

// --- pure helpers -----------------------------------------------------------

describe("normalize", () => {
  it("trims and lowercases strings", () => {
    expect(normalize(" Austria ")).toBe("austria");
  });

  it("maps nullish values to an empty string", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });

  it("stringifies numbers", () => {
    expect(normalize(42)).toBe("42");
  });
});

describe("isEmptyRow", () => {
  it("is true for null, undefined and blank cells", () => {
    expect(isEmptyRow([null, undefined, "  ", ""])).toBe(true);
    expect(isEmptyRow([])).toBe(true);
  });

  it("is false as soon as one cell has a value", () => {
    expect(isEmptyRow([null, 0])).toBe(false);
    expect(isEmptyRow(["", false])).toBe(false);
    expect(isEmptyRow([" x "])).toBe(false);
  });
});

describe("readLists", () => {
  it("returns an empty object without a List sheet", () => {
    const wb = XLSX.read(buildWorkbook({ DATA: [["a"]] }));
    expect(readLists(wb)).toEqual({});
  });

  it("collects normalized values per normalized column header", () => {
    const wb = XLSX.read(
      buildWorkbook({
        List: [
          ["Country", "Name of Species"],
          ["Austria", "Brown Trout"],
          [" Germany ", null],
        ],
      }),
    );
    expect(readLists(wb)).toEqual({
      country: new Set(["austria", "germany"]),
      "name of species": new Set(["brown trout"]),
    });
  });
});

describe("buildSchema", () => {
  const parse = (overrides: Row, lists = {}) =>
    buildSchema(lists).safeParse({ ...validRow, ...overrides });

  const failingPaths = (overrides: Row) => {
    const result = parse(overrides);
    return result.success ? [] : result.error.issues.map((i) => i.path[0]);
  };

  it("accepts a minimal valid row without a List sheet", () => {
    expect(parse({}).success).toBe(true);
  });

  it("rejects a row with an empty required field", () => {
    expect(parse({ river_name: "" }).success).toBe(false);
  });

  // Empty Excel cells arrive as undefined, not "" (#118).
  it.each(["river_name", "data_provider", "source", "site_name"])(
    "rejects a missing %s instead of coercing it to 'undefined'",
    (field) => {
      expect(failingPaths({ [field]: undefined })).toEqual([field]);
      expect(failingPaths({ [field]: null })).toEqual([field]);
    },
  );

  it("keeps an empty project as '' instead of 'undefined'", () => {
    const result = parse({ project: undefined });
    expect(result.success && result.data.project).toBe("");
  });

  it("rejects a year outside 1990-2100", () => {
    expect(parse({ year: 1800 }).success).toBe(false);
    expect(parse({ year: 2101 }).success).toBe(false);
    expect(parse({ year: 2024.5 }).success).toBe(false);
  });

  it("coerces numeric strings", () => {
    expect(parse({ year: "2024", lat_up: "48.2" }).success).toBe(true);
  });

  it("only accepts 'yes' or 'no' for approval_required", () => {
    expect(parse({ approval_required: "no" }).success).toBe(true);
    expect(failingPaths({ approval_required: "maybe" })).toEqual([
      "approval_required",
    ]);
  });

  it.each([
    ["pH_value", -1, 15, 7],
    ["conductivity", 49, 1501, 300],
    ["ox_cont", -1, 21, 10],
    ["ox_sat", 19, 131, 100],
    ["anodes", 0, 11, 2],
    ["recapture", -1, 2, 1],
    ["catch_efficiency", -1, 101, 50],
  ])("enforces the range of %s", (field, tooLow, tooHigh, ok) => {
    expect(failingPaths({ [field]: tooLow })).toEqual([field]);
    expect(failingPaths({ [field]: tooHigh })).toEqual([field]);
    expect(parse({ [field]: ok }).success).toBe(true);
  });

  it("requires whole numbers for anodes and fish_id", () => {
    expect(failingPaths({ anodes: 1.5 })).toEqual(["anodes"]);
    expect(failingPaths({ fish_id: 1.5 })).toEqual(["fish_id"]);
  });

  it("limits landmarks to 100 characters", () => {
    expect(failingPaths({ landmark_up: "x".repeat(101) })).toEqual([
      "landmark_up",
    ]);
    expect(parse({ landmark_down: "x".repeat(100) }).success).toBe(true);
  });

  it("limits the project name to 150 characters", () => {
    expect(parse({ project: "x".repeat(150) }).success).toBe(true);
    expect(failingPaths({ project: "x".repeat(151) })).toEqual(["project"]);
  });

  it("rejects Austrian coordinates outside Austria", () => {
    expect(failingPaths({ lat_up: 50 })).toEqual(["lat_up"]);
    expect(failingPaths({ long_up: 20 })).toEqual(["long_up"]);
    expect(failingPaths({ country: " AUSTRIA ", lat_up: 45 })).toEqual([
      "lat_up",
    ]);
  });

  it("accepts the same coordinates for other countries", () => {
    expect(parse({ country: "Germany", lat_up: 50 }).success).toBe(true);
  });

  it("enforces List sheet values case-insensitively when a list is present", () => {
    const lists = { country: new Set(["austria"]) };
    expect(parse({ country: "AUSTRIA" }, lists).success).toBe(true);
    expect(parse({ country: "Germany" }, lists).success).toBe(false);
  });

  it("uses the 'name of species' list for species", () => {
    const lists = { "name of species": new Set(["brown trout"]) };
    expect(parse({ species: "Pike" }, lists).success).toBe(false);
  });
});

// --- processUpload ----------------------------------------------------------

describe("processUpload", () => {
  it("fails without a DATA sheet", async () => {
    const result = await processUpload(buildWorkbook({ Other: [["a"]] }), "u1");
    expect(result).toMatchObject({
      success: false,
      error: "DATA sheet missing",
      status: 400,
    });
  });

  it("fails on an empty DATA sheet", async () => {
    const result = await processUpload(buildWorkbook({ DATA: [] }), "u1");
    expect(result).toMatchObject({ success: false, error: "No data found" });
  });

  it("lists every missing required column", async () => {
    const result = await processUpload(
      buildWorkbook({ DATA: [["country", "river_name"], ["Austria", "Danube"]] }),
      "u1",
    );
    expect(result.error).toBe("Missing required columns");
    expect(result.details).toContain("year");
    expect(result.details).toContain("species");
    expect(result.details).not.toContain("river_name");
  });

  it("stores a valid file and creates an upload entry", async () => {
    const buffer = dataFile([validRow, { ...validRow, site_name: "Site B" }]);

    const result = await processUpload(buffer, "u1");

    expect(result.success).toBe(true);
    expect(result.data?.processedRows).toBe(2);
    const [storedBuffer, filename] = vi.mocked(uploadUploadFile).mock.calls[0];
    expect(storedBuffer).toBe(buffer);
    expect(filename).toMatch(/^upload_\d+_u1\.xlsx$/);
    expect(prisma.uploads.create).toHaveBeenCalledWith({
      data: { uploaded_by: "u1", link: filename, state: "UPLOADED" },
    });
  });

  it("stops validating at the first empty row", async () => {
    const buffer = buildWorkbook({
      DATA: [
        headers,
        toCells(validRow),
        headers.map(() => ""),
        toCells({ ...validRow, year: 1800 }),
      ],
    });
    expect((await processUpload(buffer, "u1")).success).toBe(true);
  });

  it("returns an annotated Excel file for invalid cells", async () => {
    const result = await processUpload(
      dataFile([validRow, { ...validRow, year: 1800 }]),
      "u1",
    );

    expect(result).toMatchObject({
      success: false,
      error: "Validation failed",
      excelError: true,
      status: 400,
    });
    expect(uploadUploadFile).not.toHaveBeenCalled();
    expect(await readErrorNotes(result.fileBuffer as ArrayBuffer)).toEqual({
      "3:year": "Year must be between 1990 and 2100",
    });
  });

  it("flags empty required cells in the Excel file (#118)", async () => {
    const result = await processUpload(
      dataFile([validRow, { ...validRow, river_name: undefined }]),
      "u1",
    );

    expect(result.success).toBe(false);
    expect(await readErrorNotes(result.fileBuffer as ArrayBuffer)).toEqual({
      "3:river_name": "River name is required",
    });
    expect(uploadUploadFile).not.toHaveBeenCalled();
  });

  it("flags a PIT tag used for two different species in one file", async () => {
    const result = await processUpload(
      dataFile([
        { ...validRow, pit_dec: "123" },
        { ...validRow, pit_dec: "123", species: "Pike" },
      ]),
      "u1",
    );

    const notes = await readErrorNotes(result.fileBuffer as ArrayBuffer);
    expect(notes["3:pit_dec"]).toMatch(/PIT DEC 123.*unterschiedlichen Arten/);
    // DB check is skipped while the file itself has errors
    expect(prisma.fishCatch.findFirst).not.toHaveBeenCalled();
  });

  it("flags a PIT tag already stored for another species", async () => {
    vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue({
      species: { speciesName: "Pike" },
    } as any);

    const result = await processUpload(
      dataFile([{ ...validRow, pit_dec: "123" }]),
      "u1",
    );

    expect(prisma.fishCatch.findFirst).toHaveBeenCalledWith({
      where: { pitDec: "123", recapture: false },
      include: { species: true },
    });
    const notes = await readErrorNotes(result.fileBuffer as ArrayBuffer);
    expect(notes["2:pit_dec"]).toMatch(/existiert bereits.*\(Pike\)/);
  });

  it("accepts a known PIT tag of the same species", async () => {
    vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue({
      species: { speciesName: "Brown trout" },
    } as any);
    const result = await processUpload(
      dataFile([{ ...validRow, pit_dec: "123" }]),
      "u1",
    );
    expect(result.success).toBe(true);
  });

  it("reports a 500 when storage fails", async () => {
    vi.mocked(uploadUploadFile).mockRejectedValueOnce(new Error("minio down"));
    expect(await processUpload(dataFile([validRow]), "u1")).toMatchObject({
      success: false,
      status: 500,
      details: "minio down",
    });
  });
});

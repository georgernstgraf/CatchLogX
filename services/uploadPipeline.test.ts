import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The template is the binding Excel the users download; since #183 it lives
// in assets/ instead of the removed samples/ folder. These tests run the real
// template and a real fixture through the whole pipeline — validation against
// the species master, then the import write path (#202) — so the template
// cannot drift from the master and the two phases cannot drift from each other.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    imports: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    riverSite: { upsert: vi.fn() },
    sampling: { create: vi.fn() },
    fishSpecies: { findMany: vi.fn() },
    fishCatch: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { buildSpeciesIndex } from "@/lib/fishSpecies";
import { buildSchema, normalize, readLists, validateWorkbook } from "@/services/uploadService";
import { processBulkUpload } from "@/services/uploadService";

const readRepoFile = (...segments: string[]) =>
  readFileSync(path.join(process.cwd(), ...segments));

const allColumns = Object.keys(buildSchema({}).shape);

const TEMPLATE_FILE = "2026_Eingabemaske.Rohdaten.V.6.xlsx";
const template = readRepoFile("assets", TEMPLATE_FILE);

// The species master minus the entries flagged notInArtliste (pending
// clarification with Lena) — exactly what the template's List sheet carries.
const masterSpecies = JSON.parse(
  readRepoFile("assets", "species.json").toString("utf8"),
) as { id: number; speciesName: string; notInArtliste?: boolean }[];
const templateSpecies = masterSpecies
  .filter((s) => !s.notInArtliste)
  .map((s) => s.speciesName);

const templateLists = () =>
  readLists(XLSX.read(template, { type: "buffer" })) as Record<
    string,
    Set<string>
  >;

// The database master the validator checks against since #80.
const speciesIndex = buildSpeciesIndex(masterSpecies);

describe(`template (assets/${TEMPLATE_FILE})`, () => {
  it("passes the structural validation and provides every schema column", () => {
    const file = validateWorkbook(TEMPLATE_FILE, template, speciesIndex);

    expect(file.structuralError).toBeUndefined();
    expect(file.headers).toEqual(allColumns);
    // Note: the template's own example rows currently carry two method
    // spellings ("wading", "trammelnet") that are not in its method list —
    // pending a fix by Lena (#183); content errors are not asserted here.
  });

  it("has a List sheet with every list the validator checks against", () => {
    // A missing List sheet is a structural error since #80; a list that is
    // missing *within* the sheet leaves that column unchecked.
    const lists = templateLists();

    for (const name of ["country", "method", "sampling time", "assessment"]) {
      expect(lists[name]?.size, name).toBeGreaterThan(0);
    }
    // The file's own species list must still agree with the master: since #80
    // the master decides, and a drift here would reject every upload.
    expect([...lists["name of species"]].map(normalize).sort()).toEqual(
      templateSpecies.map(normalize).sort(),
    );
  });
});

// One full, valid data row (from the former samples/data.xlsx example), so
// every mandatory column of the schema is exercised. Optional columns stay
// unset except the PIT columns, which are unique per row.
const fixtureRow = {
  country: "Austria",
  river_name: "Traisen",
  year: 2020,
  data_provider: "Thomas Friedrich",
  approval_required: "yes",
  source: "IHG",
  project: "FischTraisenLIFE",
  site_name: "ATTRAI182",
  date: 44106, // Excel serial -> 2020-10-02
  lat_up: 48.37,
  long_up: 15.85,
  length_site: 10900,
  width_site: 28,
  method: "e-rake large boat",
  sampling_time: "day",
  assessment: "qualitative",
  anodes: 1,
  fished_width: 6,
  type_of_strip: "Alte Mündung",
  habitat: "alte Mündung",
  sample_id: "D1",
  species: "Rutilus rutilus",
  total_length: 220,
  remark_import:
    "Converted sample: lat_up/long_up approximate; former sampling strategy Partialprop, 96 subsections",
};

function buildFixtureWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const rows = [
    { ...fixtureRow, fish_id: 57, pit_dec: "0007F2D6C38", species: "Rutilus rutilus" },
    { ...fixtureRow, fish_id: 58, pit_dec: "0007F2D6C39", species: "Alburnus alburnus" },
    { ...fixtureRow, fish_id: 59, pit_dec: "0007F2D6C3A", species: "Salmo trutta" },
  ];
  const data = [
    allColumns,
    ...rows.map((row) => allColumns.map((column) => (row as any)[column] ?? null)),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "DATA");
  const listAoa = XLSX.utils.sheet_to_json(
    XLSX.read(template, { type: "buffer" }).Sheets["List"],
    { header: 1 },
  ) as unknown[][];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(listAoa), "List");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("upload pipeline (in-memory fixture)", () => {
  const fixture = buildFixtureWorkbook();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation((async (arg: any) =>
      typeof arg === "function" ? arg(prisma) : Promise.all(arg)) as any);
    vi.mocked(prisma.fishSpecies.findMany).mockResolvedValue(
      masterSpecies.map(({ id, speciesName }) => ({ id, speciesName })) as any,
    );
    vi.mocked(prisma.imports.findMany).mockResolvedValue([]);
    vi.mocked(prisma.imports.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.imports.create).mockImplementation((async ({ data }: any) => ({
      id: "imp-1",
      fileName: data.fileName,
      rowCount: data.rowCount,
      createdAt: new Date("2026-11-15T10:00:00Z"),
    })) as any);
    vi.mocked(prisma.riverSite.upsert).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.sampling.create).mockResolvedValue({ id: 100 } as any);
    vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([]);
    vi.mocked(prisma.fishCatch.createMany).mockResolvedValue({ count: 3 } as any);
  });

  it("passes the upload validation", () => {
    const file = validateWorkbook("fixture.xlsx", fixture, speciesIndex);

    expect(file.structuralError).toBeUndefined();
    expect(file.errors).toEqual([]);
    expect(file.dataRowCount).toBe(3);
  });

  it("imports every row into one sampling and stores the original file", async () => {
    const result = await processBulkUpload(
      [{ fileName: "fixture.xlsx", buffer: fixture }],
      "u1",
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.report[0]).toMatchObject({ status: "passed", totalRows: 3 });
    expect(result.imports).toEqual([
      expect.objectContaining({ id: "imp-1", fileName: "fixture.xlsx", rowCount: 3 }),
    ]);
    expect(result.samplings).toBe(1);
    expect(result.catches).toBe(3);

    // The original file is stored with the import (#184).
    expect(prisma.imports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileName: "fixture.xlsx",
          rowCount: 3,
          blob: { create: expect.objectContaining({ fileName: "fixture.xlsx" }) },
        }),
      }),
    );

    expect(prisma.riverSite.upsert).toHaveBeenCalledOnce();
    expect(prisma.sampling.create).toHaveBeenCalledOnce();
    expect(vi.mocked(prisma.sampling.create).mock.calls[0][0].data).toMatchObject({
      importId: "imp-1",
      catchDate: new Date("2020-10-02"),
    });
    expect(prisma.fishCatch.createMany).toHaveBeenCalledOnce();
    expect(
      (vi.mocked(prisma.fishCatch.createMany).mock.calls[0]![0]!.data as any[]).map(
        (row) => row.recapture,
      ),
    ).toEqual([false, false, false]);
  });

  it("rejects the whole file when one species is unknown, writing nothing", async () => {
    vi.mocked(prisma.fishSpecies.findMany).mockResolvedValue(
      masterSpecies
        .filter(({ speciesName }) => speciesName !== "Alburnus alburnus")
        .map(({ id, speciesName }) => ({ id, speciesName })) as any,
    );

    const result = await processBulkUpload(
      [{ fileName: "fixture.xlsx", buffer: fixture }],
      "u1",
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.report[0].status).toBe("failed");
    expect(result.report[0].errors[0].message).toMatch(/Alburnus alburnus/);
    expect(prisma.imports.create).not.toHaveBeenCalled();
    expect(prisma.sampling.create).not.toHaveBeenCalled();
    expect(prisma.fishCatch.createMany).not.toHaveBeenCalled();
  });
});

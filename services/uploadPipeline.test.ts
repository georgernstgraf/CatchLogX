import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The template is the binding Excel the users download; since #183 it lives
// in assets/ instead of the removed samples/ folder. These tests run the real
// template through the upload pipeline, so the template cannot drift from the
// species master. Prisma is mocked; the species lookup answers from the seed
// list that fills fish_species.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    uploads: { findUnique: vi.fn(), update: vi.fn() },
    fileBlob: { findUnique: vi.fn() },
    riverSite: { upsert: vi.fn() },
    sampling: { create: vi.fn() },
    fishSpecies: { findUnique: vi.fn() },
    fishCatch: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/mailer", () => ({ createMailerTransporter: vi.fn() }));
vi.mock("bcrypt", () => ({ default: { hash: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { updateUpload } from "@/services/adminService";
import {
  buildSchema,
  normalize,
  readLists,
  validateWorkbook,
} from "@/services/uploadService";

const readRepoFile = (...segments: string[]) =>
  readFileSync(path.join(process.cwd(), ...segments));

const allColumns = Object.keys(buildSchema({}).shape);

const TEMPLATE_FILE = "2026_Eingabemaske.Rohdaten.V.6.xlsx";
const template = readRepoFile("assets", TEMPLATE_FILE);

// The species master minus the entries flagged notInArtliste (pending
// clarification with Lena) — exactly what the template's List sheet carries.
const masterSpecies = JSON.parse(
  readRepoFile("assets", "species.json").toString("utf8"),
) as { speciesName: string; notInArtliste?: boolean }[];
const templateSpecies = masterSpecies
  .filter((s) => !s.notInArtliste)
  .map((s) => s.speciesName);

const templateLists = () =>
  readLists(XLSX.read(template, { type: "buffer" })) as Record<
    string,
    Set<string>
  >;

describe(`template (assets/${TEMPLATE_FILE})`, () => {
  it("passes the structural validation and provides every schema column", () => {
    // An extra or missing column would send the accept into the wrong branch.
    const file = validateWorkbook(TEMPLATE_FILE, template);

    expect(file.structuralError).toBeUndefined();
    expect(file.headers).toEqual(allColumns);
    // Note: the template's own example rows currently carry two method
    // spellings ("wading", "trammelnet") that are not in its method list —
    // pending a fix by Lena (#183); content errors are not asserted here.
  });

  it("has a List sheet with every list the validator checks against", () => {
    // A missing list is not an error: the column is then accepted unchecked.
    const lists = templateLists();

    for (const name of ["country", "method", "sampling time", "assessment"]) {
      expect(lists[name]?.size, name).toBeGreaterThan(0);
    }
    // A species outside the master would pass here and fail at the accept.
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
  const upload = { id: "up1", blobId: "blob-1", state: "UPLOADED" };
  const fixture = buildFixtureWorkbook();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.uploads.findUnique).mockResolvedValue(upload as any);
    vi.mocked(prisma.uploads.update).mockImplementation((async ({
      data,
    }: any) => ({ ...upload, ...data })) as any);
    vi.mocked(prisma.fileBlob.findUnique).mockResolvedValue({
      fileName: "fixture.xlsx",
      data: fixture,
    } as any);
    vi.mocked(prisma.riverSite.upsert).mockResolvedValue({ id: 10 } as any);
    vi.mocked(prisma.sampling.create).mockResolvedValue({ id: 100 } as any);
    vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue(null);
    // Exact match, like the unique index on speciesName.
    vi.mocked(prisma.fishSpecies.findUnique).mockImplementation((async ({
      where,
    }: any) =>
      templateSpecies.includes(where.speciesName) ? { id: 5 } : null) as any);
  });

  it("passes the upload validation", () => {
    const file = validateWorkbook("fixture.xlsx", fixture);

    expect(file.structuralError).toBeUndefined();
    expect(file.errors).toEqual([]);
    expect(file.dataRowCount).toBe(3);
  });

  it("imports every row and ends in SAVED_IN_DB", async () => {
    await updateUpload("up1", "accept", undefined);

    expect(
      vi.mocked(prisma.uploads.update).mock.calls.at(-1)![0].data,
    ).toEqual({ state: "SAVED_IN_DB", note: null });
    expect(prisma.fishCatch.create).toHaveBeenCalledTimes(3);
    expect(prisma.sampling.create).toHaveBeenCalledOnce();
    expect(
      vi.mocked(prisma.sampling.create).mock.calls[0][0].data,
    ).toMatchObject({ catchDate: new Date("2020-10-02") });
  });
});

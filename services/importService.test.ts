import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the one write path of #202: import, delete, list, download.
// Prisma is mocked; workbooks are built in memory, nothing is stored.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    imports: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sampling: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    fishCatch: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    riverSite: { upsert: vi.fn() },
    fileBlob: { delete: vi.fn() },
    fishSpecies: { findMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { buildSpeciesIndex } from "@/lib/fishSpecies";
import type { CellValue } from "@/lib/excelRows";
import {
  DuplicateImportError,
  buildCatchData,
  buildRiverSiteData,
  buildSamplingData,
  buildSiteCode,
  deleteImport,
  fileHash,
  getImportFile,
  listImports,
  parseDate,
  toBoolean,
  toFloat,
  toInt,
  writeImports,
} from "@/services/importService";

// --- helpers ----------------------------------------------------------------

type Row = Record<string, CellValue>;

const headers = [
  "river_name",
  "site_name",
  "lat_up",
  "long_up",
  "date",
  "year",
  "data_provider",
  "approval_required",
  "source",
  "project",
  "species",
  "total_length",
  "weight",
  "pit_dec",
  "pit_hex",
  "fish_id",
  "method",
  "assessment",
  "sampling_time",
  "temp",
  "conductivity",
  "pH_value",
  "ox_cont",
  "ox_sat",
  "anodes",
  "fished_length",
  "fished_width",
  "type_of_strip",
  "habitat",
  "catch_efficiency",
  "remark_raw_data",
  "remark_import",
];

const row = (overrides: Row = {}): Row => ({
  river_name: "Danube",
  site_name: "Site A",
  lat_up: 48.2,
  long_up: 16.3,
  date: "2024-05-01",
  year: 2024,
  data_provider: "BOKU",
  approval_required: "yes",
  source: "field survey",
  project: "CatchLogX",
  species: "Rutilus rutilus",
  total_length: 220,
  weight: 180.5,
  ...overrides,
});

function workbook(rows: Row[]): Buffer {
  const data = [
    headers,
    ...rows.map((entry) => headers.map((header) => entry[header] ?? null)),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "DATA");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

const species = buildSpeciesIndex([
  { id: 5, speciesName: "Rutilus rutilus" },
  { id: 6, speciesName: "Salmo trutta" },
]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (arg: any) =>
    typeof arg === "function" ? arg(prisma) : Promise.all(arg)) as any);
  vi.mocked(prisma.imports.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.imports.create).mockImplementation((async ({ data }: any) => ({
    id: `imp-${data.fileName}`,
    fileName: data.fileName,
    rowCount: data.rowCount,
    createdAt: new Date("2026-11-15T10:00:00Z"),
  })) as any);
  vi.mocked(prisma.riverSite.upsert).mockResolvedValue({ id: 10 } as any);
  let samplingId = 100;
  vi.mocked(prisma.sampling.create).mockImplementation((async () => ({
    id: samplingId++,
  })) as any);
  vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([]);
  vi.mocked(prisma.fishCatch.createMany).mockResolvedValue({ count: 1 } as any);
});

// --- value parsing (moved from adminService, #202) ---------------------------

describe("parseDate", () => {
  it("returns null for empty values", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("   ")).toBeNull();
  });

  it("passes Date objects through", () => {
    const date = new Date("2024-05-01");
    expect(parseDate(date)).toBe(date);
  });

  it("converts Excel serial numbers", () => {
    expect(parseDate(45413)?.toISOString().slice(0, 10)).toBe("2024-05-01");
  });

  it("parses German dd.mm.yyyy dates", () => {
    expect(parseDate("01.05.2024")).toEqual(new Date(2024, 4, 1));
  });

  it("parses ISO strings", () => {
    expect(parseDate("2024-05-01")?.toISOString().slice(0, 10)).toBe("2024-05-01");
  });

  it("returns null for garbage", () => {
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("toFloat / toInt", () => {
  it("map empty values to null", () => {
    expect(toFloat(null)).toBeNull();
    expect(toInt(undefined)).toBeNull();
    expect(toInt("")).toBeNull();
  });

  it("parse numbers and numeric strings", () => {
    expect(toFloat("12.5")).toBe(12.5);
    expect(toInt("42")).toBe(42);
    expect(toInt(7.9)).toBe(7);
  });

  it("accept a decimal comma", () => {
    expect(toFloat("12,5")).toBe(12.5);
  });

  it("return null for non-numeric strings", () => {
    expect(toFloat("abc")).toBeNull();
    expect(toInt("abc")).toBeNull();
  });
});

describe("toBoolean", () => {
  it("understands yes/no case-insensitively", () => {
    expect(toBoolean("yes")).toBe(true);
    expect(toBoolean("NO")).toBe(false);
    expect(toBoolean("ja")).toBe(true);
  });

  it("returns null for anything else", () => {
    expect(toBoolean("maybe")).toBeNull();
    expect(toBoolean(null)).toBeNull();
  });
});

// --- row mapping ------------------------------------------------------------

describe("buildSiteCode", () => {
  it("derives a deterministic code from river, site and coordinates", () => {
    expect(buildSiteCode(row())).toBe("Danube__Site A__48.2__16.3");
  });

  it("is stable across rows of the same site", () => {
    expect(buildSiteCode(row({ species: "Salmo trutta" }))).toBe(
      buildSiteCode(row()),
    );
  });
});

describe("buildRiverSiteData", () => {
  it("maps the template columns onto the RiverSite fields", () => {
    expect(
      buildRiverSiteData(
        row({
          landmark_up: "bridge",
          landmark_down: "powerline",
          lat_down: 48.1,
          long_down: 16.4,
          length_site: 10900,
          width_site: 28,
        }),
      ),
    ).toEqual({
      riverName: "Danube",
      siteName: "Site A",
      landmarkUp: "bridge",
      latitude: 48.2,
      longitude: 16.3,
      landmarkDown: "powerline",
      latDown: 48.1,
      longDown: 16.4,
      localityLength: 10900,
      localityWidth: 28,
    });
  });
});

describe("buildSamplingData", () => {
  it("carries the import id and maps the sampling columns", () => {
    const data = buildSamplingData(
      row({
        fishing_district: "Vienna",
        preclassification_stressor: "urban",
        temp: 14.5,
        conductivity: 320,
        pH_value: 7.8,
        ox_cont: 9.1,
        ox_sat: 92,
        sampling_time: "day",
        fished_length: 100,
        fished_width: 12,
        type_of_strip: "point",
        catch_efficiency: 75,
        remark_raw_data: "raw",
        remark_import: "imported",
      }),
      10,
      "imp-1",
    );

    expect(data).toMatchObject({
      siteId: 10,
      importId: "imp-1",
      year: 2024,
      catchDate: new Date("2024-05-01"),
      dataProvider: "BOKU",
      askProviderBeforeUse: true,
      fishingAuthority: "Vienna",
      preclassificationStressor: "urban",
      temp: 14.5,
      conductivity: 320,
      pHValue: 7.8,
      oCont: 9.1,
      oSat: 92,
      samplingStrategy: "day",
      lengthSubsection: 100,
      widthSubsection: 12,
      typeOfStrip: "point",
      catchEfficiency: 75,
      remarksRawData: "raw",
      remarkImport: "imported",
    });
  });
});

describe("buildCatchData", () => {
  it("maps length, weight, PIT and the recapture flag", () => {
    expect(
      buildCatchData(
        row({ pit_dec: "0007F2D6C38", pit_hex: "ABC", fish_id: 57 }),
        100,
        5,
        true,
      ),
    ).toEqual({
      samplingId: 100,
      speciesId: 5,
      fishId: "57",
      lengthMm: 220,
      totalWeightGr: 180.5,
      pitDec: "0007F2D6C38",
      pitHex: "ABC",
      recapture: true,
    });
  });
});

describe("fileHash", () => {
  it("is the sha256 of the bytes", () => {
    expect(fileHash(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

// --- writeImports -----------------------------------------------------------

describe("writeImports", () => {
  it("writes one import, one site, one sampling and the catches", async () => {
    const outcome = await writeImports(
      [{ fileName: "a.xlsx", buffer: workbook([row(), row({ pit_dec: "1" })]) }],
      "u1",
      "batch-1",
      species,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.imports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          batchId: "batch-1",
          user: { connect: { id: "u1" } },
          fileName: "a.xlsx",
          rowCount: 2,
          blob: { create: expect.objectContaining({ fileName: "a.xlsx" }) },
        }),
      }),
    );
    // One site upsert, one sampling for the single site+date.
    expect(prisma.riverSite.upsert).toHaveBeenCalledOnce();
    expect(prisma.sampling.create).toHaveBeenCalledOnce();
    expect(prisma.sampling.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ importId: "imp-a.xlsx", siteId: 10 }),
      }),
    );
    expect(prisma.fishCatch.createMany).toHaveBeenCalledOnce();
    expect(prisma.fishCatch.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ samplingId: 100, speciesId: 5, recapture: false }),
        expect.objectContaining({ samplingId: 100, speciesId: 5, recapture: false }),
      ],
    });
    expect(outcome).toMatchObject({ samplings: 1, catches: 1 });
    expect(outcome.imports[0]).toMatchObject({ fileName: "a.xlsx", rowCount: 2 });
  });

  it("creates one sampling per site and catch date", async () => {
    await writeImports(
      [
        {
          fileName: "a.xlsx",
          buffer: workbook([
            row(),
            row({ date: "2024-06-01" }),
            row({ site_name: "Site B" }),
          ]),
        },
      ],
      "u1",
      "batch-1",
      species,
    );

    expect(prisma.riverSite.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.sampling.create).toHaveBeenCalledTimes(3);
  });

  it("marks a PIT as recapture when it appears earlier in the bulk", async () => {
    await writeImports(
      [
        {
          fileName: "a.xlsx",
          buffer: workbook([row({ pit_dec: "123" }), row({ pit_dec: "123", date: "2024-06-01" })]),
        },
      ],
      "u1",
      "batch-1",
      species,
    );

    const data = vi
      .mocked(prisma.fishCatch.createMany)
      .mock.calls.flatMap((call) => call[0]!.data as any[]);
    expect(data.map((catchRow) => catchRow.recapture)).toEqual([false, true]);
  });

  it("marks a PIT as recapture when the database already has it", async () => {
    vi.mocked(prisma.fishCatch.findMany).mockResolvedValue([
      { pitDec: "123" },
    ] as any);

    await writeImports(
      [{ fileName: "a.xlsx", buffer: workbook([row({ pit_dec: "123" })]) }],
      "u1",
      "batch-1",
      species,
    );

    const data = vi.mocked(prisma.fishCatch.createMany).mock.calls[0]![0]!.data as any[];
    expect(data[0].recapture).toBe(true);
  });

  it("sees the rows of an earlier file in the same bulk", async () => {
    await writeImports(
      [
        { fileName: "a.xlsx", buffer: workbook([row({ pit_dec: "123" })]) },
        { fileName: "b.xlsx", buffer: workbook([row({ pit_dec: "123" })]) },
      ],
      "u1",
      "batch-1",
      species,
    );

    const second = vi.mocked(prisma.fishCatch.createMany).mock.calls[1]![0]!.data as any[];
    expect(second[0].recapture).toBe(true);
  });

  it("refuses bytes that an active import already holds", async () => {
    vi.mocked(prisma.imports.findFirst).mockResolvedValue({
      id: "old",
      fileName: "a.xlsx",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    } as any);

    await expect(
      writeImports(
        [{ fileName: "a.xlsx", buffer: workbook([row()]) }],
        "u1",
        "batch-1",
        species,
      ),
    ).rejects.toBeInstanceOf(DuplicateImportError);

    expect(prisma.fishCatch.createMany).not.toHaveBeenCalled();
  });

  it("takes an advisory lock on the file hash before checking", async () => {
    await writeImports(
      [{ fileName: "a.xlsx", buffer: workbook([row()]) }],
      "u1",
      "batch-1",
      species,
    );

    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it("throws when a species is not in the master (validation should prevent it)", async () => {
    await expect(
      writeImports(
        [{ fileName: "a.xlsx", buffer: workbook([row({ species: "Nessie" })]) }],
        "u1",
        "batch-1",
        species,
      ),
    ).rejects.toThrow(/Nessie/);
  });

  // Regression #209: the Prisma default of 5 s killed every file above ~7 000
  // rows (2026_B, 13 454 rows, answered 500 in the cutover dry run).
  it("gives the write transaction a timeout that outlives a large delivery", async () => {
    await writeImports(
      [{ fileName: "a.xlsx", buffer: workbook([row()]) }],
      "u1",
      "batch-1",
      species,
    );

    const options = vi.mocked(prisma.$transaction).mock.calls[0][1] as {
      timeout?: number;
      maxWait?: number;
    };
    expect(options).toBeDefined();
    // 35 413 rows (the largest cutover file) take ~15-20 s; 60 s is the floor.
    expect(options.timeout).toBeGreaterThanOrEqual(60_000);
    expect(options.maxWait).toBeGreaterThanOrEqual(2_000);
  });
});

// --- deleteImport -----------------------------------------------------------

describe("deleteImport", () => {
  const stored = {
    id: "imp-1",
    fileName: "a.xlsx",
    userId: "owner",
    blobId: "blob-1",
  };

  beforeEach(() => {
    vi.mocked(prisma.imports.findUnique).mockResolvedValue(stored as any);
    vi.mocked(prisma.imports.deleteMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.sampling.findMany).mockResolvedValue([
      { id: 100 },
      { id: 101 },
    ] as any);
    vi.mocked(prisma.fishCatch.deleteMany).mockResolvedValue({ count: 42 } as any);
    vi.mocked(prisma.sampling.deleteMany).mockResolvedValue({ count: 2 } as any);
    vi.mocked(prisma.fileBlob.delete).mockResolvedValue({} as any);
  });

  // #184 (decided 2026-11-15): the tombstone is gone. A deleted import leaves
  // no `Imports` row behind, so nothing shows up as "Deleted on ..." in the
  // admin or the "My Imports" list.
  it("removes the Imports row itself: gone, not tombstoned", async () => {
    const result = await deleteImport("imp-1", { id: "owner", role: "VIEWER" });

    expect(result).toEqual({ deleted: true, catches: 42, samplings: 2 });
    expect(prisma.imports.deleteMany).toHaveBeenCalledWith({
      where: { id: "imp-1" },
    });
    expect(prisma.imports.updateMany).not.toHaveBeenCalled();
    expect(prisma.fishCatch.deleteMany).toHaveBeenCalledWith({
      where: { samplingId: { in: [100, 101] } },
    });
    expect(prisma.sampling.deleteMany).toHaveBeenCalledWith({
      where: { importId: "imp-1" },
    });
    expect(prisma.fileBlob.delete).toHaveBeenCalledWith({
      where: { id: "blob-1" },
    });
    // River sites and species are shared and stay untouched.
    expect(prisma.riverSite.upsert).not.toHaveBeenCalled();
  });

  // `Sampling.importId` and `Imports.blobId` are both onDelete: Restrict — the
  // order below is the only one the foreign keys accept.
  it("deletes in foreign-key order: catches, samplings, the row, the file", async () => {
    await deleteImport("imp-1", { id: "owner", role: "VIEWER" });

    const at = (mock: unknown) =>
      (mock as { mock: { invocationCallOrder: number[] } }).mock
        .invocationCallOrder[0];

    expect(at(prisma.fishCatch.deleteMany)).toBeLessThan(
      at(prisma.sampling.deleteMany),
    );
    expect(at(prisma.sampling.deleteMany)).toBeLessThan(
      at(prisma.imports.deleteMany),
    );
    expect(at(prisma.imports.deleteMany)).toBeLessThan(
      at(prisma.fileBlob.delete),
    );
  });

  // The only trace left is a journal line: the row itself is gone.
  it("leaves a log line naming the file, the actor and the counts", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await deleteImport("imp-1", { id: "owner", role: "VIEWER" });

    expect(info).toHaveBeenCalledWith(expect.stringContaining("a.xlsx"));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("imp-1"));
    info.mockRestore();
  });

  it("forbids a foreign user", async () => {
    const result = await deleteImport("imp-1", { id: "stranger", role: "VIEWER" });

    expect(result).toEqual({ forbidden: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.fishCatch.deleteMany).not.toHaveBeenCalled();
  });

  // Regression #209: deleting the largest import takes longer than 5 s too.
  it("gives the delete transaction the same generous timeout", async () => {
    await deleteImport("imp-1", { id: "owner", role: "VIEWER" });

    const options = vi.mocked(prisma.$transaction).mock.calls[0][1] as {
      timeout?: number;
    };
    expect(options).toBeDefined();
    expect(options.timeout).toBeGreaterThanOrEqual(60_000);
  });

  it.each(["ADMIN", "SUPER_ADMIN"] as const)("lets a %s delete a foreign import", async (role) => {
    const result = await deleteImport("imp-1", { id: "boss", role });

    expect(result).toMatchObject({ deleted: true });
    expect(prisma.fishCatch.deleteMany).toHaveBeenCalled();
  });

  it("reports an unknown import", async () => {
    vi.mocked(prisma.imports.findUnique).mockResolvedValue(null);
    expect(await deleteImport("x", { id: "owner", role: "VIEWER" })).toEqual({
      notFound: true,
    });
  });

  it("reports the loser of two concurrent deletes as not found", async () => {
    vi.mocked(prisma.imports.deleteMany).mockResolvedValue({ count: 0 } as any);

    expect(await deleteImport("imp-1", { id: "owner", role: "VIEWER" })).toEqual({
      notFound: true,
    });
    expect(prisma.fileBlob.delete).not.toHaveBeenCalled();
  });

  it("leaves the recapture flags of other imports alone", async () => {
    await deleteImport("imp-1", { id: "owner", role: "VIEWER" });

    // Only the catches of this import are removed; nothing is updated.
    expect(prisma.fishCatch.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.fishCatch).not.toHaveProperty("updateMany");
  });
});

// --- listing and download ---------------------------------------------------

describe("listImports", () => {
  const storedRow = {
    id: "imp-1",
    fileName: "a.xlsx",
    fileHash: "hash",
    rowCount: 3,
    createdAt: new Date("2026-11-15T10:00:00Z"),
    userId: "u1",
    user: { username: "u1", name: "Uwe" },
    _count: { samplings: 2 },
  };

  beforeEach(() => {
    vi.mocked(prisma.imports.findMany).mockResolvedValue([storedRow] as any);
  });

  it("flattens the uploader and the sampling count", async () => {
    const [item] = await listImports();

    expect(item).toMatchObject({
      id: "imp-1",
      fileName: "a.xlsx",
      rowCount: 3,
      samplings: 2,
      uploadedByUsername: "u1",
      uploadedByName: "Uwe",
    });
    expect(item).not.toHaveProperty("user");
    expect(item).not.toHaveProperty("_count");
    // No tombstone column any more (#184): nothing to show as "deleted".
    expect(item).not.toHaveProperty("deletedAt");
  });

  it("filters by owner when a userId is given", async () => {
    await listImports({ userId: "u1" });

    expect(prisma.imports.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });

  it("lists everything without a userId (admin view)", async () => {
    await listImports();

    expect(
      vi.mocked(prisma.imports.findMany).mock.calls[0][0]!.where,
    ).toBeUndefined();
  });
});

describe("getImportFile", () => {
  const blob = { fileName: "a.xlsx", data: Buffer.from("bytes") };

  beforeEach(() => {
    vi.mocked(prisma.imports.findUnique).mockResolvedValue({
      fileName: "a.xlsx",
      userId: "owner",
      blob,
    } as any);
  });

  it("returns the stored bytes", async () => {
    const file = await getImportFile("imp-1");
    expect(file?.fileName).toBe("a.xlsx");
    expect(file?.fileBuffer.toString()).toBe("bytes");
  });

  it("returns null when the blob was deleted", async () => {
    vi.mocked(prisma.imports.findUnique).mockResolvedValue({
      fileName: "a.xlsx",
      userId: "owner",
      blob: null,
    } as any);

    expect(await getImportFile("imp-1")).toBeNull();
  });

  it("hides the file from a foreign user but not from an admin", async () => {
    expect(
      await getImportFile("imp-1", { id: "stranger", role: "VIEWER" }),
    ).toBeNull();
    expect(
      await getImportFile("imp-1", { id: "boss", role: "ADMIN" }),
    ).not.toBeNull();
    expect(
      await getImportFile("imp-1", { id: "owner", role: "VIEWER" }),
    ).not.toBeNull();
  });
});

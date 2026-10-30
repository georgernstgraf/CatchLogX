import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real files in samples/ through the upload pipeline (#120), so a
// schema change cannot leave the templates behind again. Prisma is mocked; the
// species lookup answers from the seed list that fills fish_species.
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
const sample = (fileName: string) => readRepoFile("samples", fileName);

const allColumns = Object.keys(buildSchema({}).shape);

// Read from the source: importing the script would run its main().
const seedSpecies = [
  ...readRepoFile("scripts", "insert-fish.ts")
    .toString("utf8")
    .matchAll(/speciesName: "([^"]+)"/g),
].map((match) => match[1]);

function listsOf(fileName: string) {
  const workbook = XLSX.read(sample(fileName), { type: "buffer" });
  return readLists(workbook) as Record<string, Set<string>>;
}

describe.each([
  { fileName: "import-template.xlsx", dataRows: 1, catchDate: "2023-09-23" },
  { fileName: "data.xlsx", dataRows: 18, catchDate: "2020-10-02" },
])("samples/$fileName", ({ fileName, dataRows, catchDate }) => {
  it("passes the upload validation", () => {
    const file = validateWorkbook(fileName, sample(fileName));

    expect(file.structuralError).toBeUndefined();
    expect(file.errors).toEqual([]);
    expect(file.dataRowCount).toBe(dataRows);
  });

  it("provides every schema column and nothing else", () => {
    // An extra `site_code` column would send the accept into the legacy branch.
    expect(validateWorkbook(fileName, sample(fileName)).headers).toEqual(
      allColumns,
    );
  });

  it("has a List sheet with every list the validator checks against", () => {
    // A missing list is not an error: the column is then accepted unchecked.
    const lists = listsOf(fileName);

    for (const name of ["country", "method", "sampling time", "assessment"]) {
      expect(lists[name]?.size, name).toBeGreaterThan(0);
    }
    // A species outside the seed would pass here and fail at the accept.
    expect([...lists["name of species"]].sort()).toEqual(
      seedSpecies.map(normalize).sort(),
    );
  });

  describe("on admin accept", () => {
    const upload = { id: "up1", blobId: "blob-1", state: "UPLOADED" };

    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(prisma.uploads.findUnique).mockResolvedValue(upload as any);
      vi.mocked(prisma.uploads.update).mockImplementation((async ({
        data,
      }: any) => ({ ...upload, ...data })) as any);
      vi.mocked(prisma.fileBlob.findUnique).mockResolvedValue({
        fileName,
        data: sample(fileName),
      } as any);
      vi.mocked(prisma.riverSite.upsert).mockResolvedValue({ id: 10 } as any);
      vi.mocked(prisma.sampling.create).mockResolvedValue({ id: 100 } as any);
      vi.mocked(prisma.fishCatch.findFirst).mockResolvedValue(null);
      // Exact match, like the unique index on speciesName.
      vi.mocked(prisma.fishSpecies.findUnique).mockImplementation((async ({
        where,
      }: any) =>
        seedSpecies.includes(where.speciesName) ? { id: 5 } : null) as any);
    });

    it("imports every row and ends in SAVED_IN_DB", async () => {
      await updateUpload("up1", "accept", undefined);

      expect(
        vi.mocked(prisma.uploads.update).mock.calls.at(-1)![0].data,
      ).toEqual({ state: "SAVED_IN_DB", note: null });
      expect(prisma.fishCatch.create).toHaveBeenCalledTimes(dataRows);
      expect(prisma.sampling.create).toHaveBeenCalledOnce();
      expect(
        vi.mocked(prisma.sampling.create).mock.calls[0][0].data,
      ).toMatchObject({ catchDate: new Date(catchDate) });
    });
  });
});

describe("samples/import-template.xlsx example row", () => {
  it("fills every column, so each validation rule is really exercised", () => {
    const { rows } = validateWorkbook(
      "import-template.xlsx",
      sample("import-template.xlsx"),
    );
    const emptyColumns = allColumns.filter(
      (_, column) => (rows[1]?.[column] ?? "") === "",
    );

    expect(emptyColumns).toEqual([]);
  });
});

describe("samples/import-template.csv", () => {
  const [header, example, ...rest] = sample("import-template.csv")
    .toString("utf8")
    .replace(/^﻿/, "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(";"));

  it("has the schema columns and one example row, no meta rows", () => {
    expect(header).toEqual(allColumns);
    expect(example).toHaveLength(allColumns.length);
    expect(rest).toEqual([]);
  });

  it("carries an example row that passes the validator", () => {
    // `;` and decimal commas are what Excel expects under an Austrian locale.
    const row = Object.fromEntries(
      header.map((column, i) => [
        column,
        example[i].replace(/^(\d+),(\d+)$/, "$1.$2"),
      ]),
    );
    const schema = buildSchema(listsOf("import-template.xlsx"));

    expect(schema.safeParse(row).error).toBeUndefined();
  });
});

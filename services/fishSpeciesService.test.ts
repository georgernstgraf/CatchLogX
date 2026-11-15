import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the fish species service (#201): listing with catch counts,
// creation, renaming and the delete guard that refuses to remove a species
// still referenced by catches. Prisma is mocked; the assertions pin the
// query shapes so a changed select or where clause fails loudly.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    fishSpecies: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    fishCatch: {
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    imports: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  createFishSpecies,
  deleteFishSpecies,
  listFishSpecies,
  listSpeciesImports,
  updateFishSpecies,
} from "@/services/fishSpeciesService";

const speciesWithCountSelect = {
  id: true,
  speciesName: true,
  germanName: true,
  family: true,
  _count: { select: { catches: true } },
};

function prismaError(code: string) {
  return Object.assign(new Error(`Prisma error ${code}`), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listFishSpecies", () => {
  it("orders by species name and selects the catch count", async () => {
    vi.mocked(prisma.fishSpecies.findMany).mockResolvedValue([]);

    await listFishSpecies();

    expect(prisma.fishSpecies.findMany).toHaveBeenCalledWith({
      orderBy: { speciesName: "asc" },
      select: speciesWithCountSelect,
    });
  });

  it("flattens _count into catchCount and drops the raw relation count", async () => {
    vi.mocked(prisma.fishSpecies.findMany).mockResolvedValue([
      {
        id: 1,
        speciesName: "Salmo trutta",
        germanName: "Bachforelle",
        family: "Salmonidae",
        _count: { catches: 42 },
      },
    ] as any);

    const result = await listFishSpecies();

    expect(result).toEqual([
      {
        id: 1,
        speciesName: "Salmo trutta",
        germanName: "Bachforelle",
        family: "Salmonidae",
        catchCount: 42,
      },
    ]);
    expect(result[0]).not.toHaveProperty("_count");
  });
});

describe("createFishSpecies", () => {
  it("rejects an empty species name without touching the database", async () => {
    expect(await createFishSpecies({ speciesName: "   " })).toEqual({
      invalid: true,
    });
    expect(prisma.fishSpecies.create).not.toHaveBeenCalled();
  });

  it("normalizes NBSP and inner whitespace before writing (#201)", async () => {
    vi.mocked(prisma.fishSpecies.create).mockResolvedValue({
      id: 113,
      speciesName: "Silurus glanis",
      germanName: "Wels",
      family: "Siluridae",
      _count: { catches: 0 },
    } as any);

    await createFishSpecies({
      speciesName: "Silurus\u00A0 \u00A0glanis",
      germanName: "Wels",
      family: "Siluridae",
    });

    expect(prisma.fishSpecies.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ speciesName: "Silurus glanis" }),
      }),
    );
  });

  it("trims the species name before writing", async () => {
    vi.mocked(prisma.fishSpecies.create).mockResolvedValue({
      id: 2,
      speciesName: "Rutilus rutilus",
      germanName: "Rotauge",
      family: "Cyprinidae",
      _count: { catches: 0 },
    } as any);

    await createFishSpecies({
      speciesName: "  Rutilus rutilus  ",
      germanName: "Rotauge",
      family: "Cyprinidae",
    });

    expect(prisma.fishSpecies.create).toHaveBeenCalledWith({
      data: {
        speciesName: "Rutilus rutilus",
        germanName: "Rotauge",
        family: "Cyprinidae",
      },
      select: speciesWithCountSelect,
    });
  });

  it("reports a duplicate name as a conflict", async () => {
    vi.mocked(prisma.fishSpecies.create).mockRejectedValue(prismaError("P2002"));

    expect(await createFishSpecies({ speciesName: "Salmo trutta" })).toEqual({
      conflict: true,
    });
  });

  it("returns the created species with a zero catch count", async () => {
    vi.mocked(prisma.fishSpecies.create).mockResolvedValue({
      id: 3,
      speciesName: "Esox lucius",
      germanName: null,
      family: null,
      _count: { catches: 0 },
    } as any);

    const result = await createFishSpecies({ speciesName: "Esox lucius" });

    expect(result).toEqual({
      species: {
        id: 3,
        speciesName: "Esox lucius",
        germanName: null,
        family: null,
        catchCount: 0,
      },
    });
  });

  it("rethrows unexpected database errors", async () => {
    vi.mocked(prisma.fishSpecies.create).mockRejectedValue(new Error("boom"));

    await expect(createFishSpecies({ speciesName: "Esox lucius" })).rejects.toThrow(
      "boom",
    );
  });
});

describe("updateFishSpecies", () => {
  it("normalizes NBSP on rename so a near-duplicate cannot be created (#201)", async () => {
    vi.mocked(prisma.fishSpecies.update).mockResolvedValue({
      id: 113,
      speciesName: "Silurus glanis",
      germanName: "Wels",
      family: "Siluridae",
      _count: { catches: 9 },
    } as any);

    await updateFishSpecies(113, { speciesName: "Silurus\u00A0glanis" });

    expect(prisma.fishSpecies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { speciesName: "Silurus glanis" },
      }),
    );
  });

  it("trims a renamed species name and keeps the id stable", async () => {
    vi.mocked(prisma.fishSpecies.update).mockResolvedValue({
      id: 1,
      speciesName: "Salmo trutta",
      germanName: "Bachforelle",
      family: "Salmonidae",
      _count: { catches: 7 },
    } as any);

    const result = await updateFishSpecies(1, {
      speciesName: "  Salmo trutta ",
      germanName: "Bachforelle",
    });

    expect(prisma.fishSpecies.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { speciesName: "Salmo trutta", germanName: "Bachforelle" },
      select: speciesWithCountSelect,
    });
    expect(result).toEqual({
      species: {
        id: 1,
        speciesName: "Salmo trutta",
        germanName: "Bachforelle",
        family: "Salmonidae",
        catchCount: 7,
      },
    });
  });

  it("rejects an empty species name without writing", async () => {
    expect(await updateFishSpecies(1, { speciesName: "" })).toEqual({
      invalid: true,
    });
    expect(prisma.fishSpecies.update).not.toHaveBeenCalled();
  });

  it("only writes the fields that were passed", async () => {
    vi.mocked(prisma.fishSpecies.update).mockResolvedValue({
      id: 1,
      speciesName: "Salmo trutta",
      germanName: "Forelle",
      family: null,
      _count: { catches: 0 },
    } as any);

    await updateFishSpecies(1, { germanName: "Forelle" });

    expect(prisma.fishSpecies.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { germanName: "Forelle" } }),
    );
  });

  it("reports an unknown species as not found", async () => {
    vi.mocked(prisma.fishSpecies.update).mockRejectedValue(prismaError("P2025"));

    expect(await updateFishSpecies(99, { germanName: "x" })).toEqual({
      notFound: true,
    });
  });

  it("reports a duplicate name as a conflict", async () => {
    vi.mocked(prisma.fishSpecies.update).mockRejectedValue(prismaError("P2002"));

    expect(await updateFishSpecies(1, { speciesName: "Rutilus rutilus" })).toEqual({
      conflict: true,
    });
  });

  it("never rewrites catches: the foreign key carries the rename", async () => {
    vi.mocked(prisma.fishSpecies.update).mockResolvedValue({
      id: 1,
      speciesName: "Salmo trutta fario",
      germanName: "Bachforelle",
      family: "Salmonidae",
      _count: { catches: 3 },
    } as any);

    await updateFishSpecies(1, { speciesName: "Salmo trutta fario" });

    expect(prisma.fishCatch.update).not.toHaveBeenCalled();
    expect(prisma.fishCatch.updateMany).not.toHaveBeenCalled();
  });
});

describe("deleteFishSpecies", () => {
  it("refuses to delete a species that is still used by catches", async () => {
    vi.mocked(prisma.fishCatch.count).mockResolvedValue(12);

    expect(await deleteFishSpecies(1)).toEqual({ conflict: true, catchCount: 12 });
    expect(prisma.fishCatch.count).toHaveBeenCalledWith({
      where: { speciesId: 1 },
    });
    expect(prisma.fishSpecies.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused species", async () => {
    vi.mocked(prisma.fishCatch.count).mockResolvedValue(0);
    vi.mocked(prisma.fishSpecies.delete).mockResolvedValue({ id: 1 } as any);

    expect(await deleteFishSpecies(1)).toEqual({ deleted: true });
    expect(prisma.fishSpecies.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it("reports a foreign key race as a conflict without a count", async () => {
    vi.mocked(prisma.fishCatch.count).mockResolvedValue(0);
    vi.mocked(prisma.fishSpecies.delete).mockRejectedValue(prismaError("P2003"));

    expect(await deleteFishSpecies(1)).toEqual({ conflict: true });
  });

  it("reports an already deleted species as not found", async () => {
    vi.mocked(prisma.fishCatch.count).mockResolvedValue(0);
    vi.mocked(prisma.fishSpecies.delete).mockRejectedValue(prismaError("P2025"));

    expect(await deleteFishSpecies(1)).toEqual({ notFound: true });
  });
});

describe("listSpeciesImports", () => {
  it("lists the imports a species comes from, newest first", async () => {
    vi.mocked(prisma.fishSpecies.findUnique).mockResolvedValue({ id: 7 } as any);
    vi.mocked(prisma.imports.findMany).mockResolvedValue([
      {
        id: "imp-2",
        fileName: "2026_B.xlsx",
        createdAt: new Date("2026-11-14T10:00:00Z"),
        user: { username: "georg", name: "Georg Ernst Graf" },
      },
      {
        id: "imp-1",
        fileName: "2026_A.xlsx",
        createdAt: new Date("2026-06-18T10:00:00Z"),
        user: { username: "lena", name: null },
      },
    ] as any);

    const result = await listSpeciesImports(7);

    expect(prisma.imports.findMany).toHaveBeenCalledWith({
      where: { samplings: { some: { catches: { some: { speciesId: 7 } } } } },
      orderBy: [{ createdAt: "desc" }, { fileName: "asc" }],
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        user: { select: { username: true, name: true } },
      },
    });
    expect(result).toEqual([
      {
        id: "imp-2",
        fileName: "2026_B.xlsx",
        createdAt: new Date("2026-11-14T10:00:00Z"),
        importedByUsername: "georg",
        importedByName: "Georg Ernst Graf",
      },
      {
        id: "imp-1",
        fileName: "2026_A.xlsx",
        createdAt: new Date("2026-06-18T10:00:00Z"),
        importedByUsername: "lena",
        importedByName: null,
      },
    ]);
  });

  it("returns null for an unknown species and does not query imports", async () => {
    vi.mocked(prisma.fishSpecies.findUnique).mockResolvedValue(null);

    expect(await listSpeciesImports(999)).toBeNull();
    expect(prisma.imports.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty list when the species has no catches", async () => {
    vi.mocked(prisma.fishSpecies.findUnique).mockResolvedValue({ id: 7 } as any);
    vi.mocked(prisma.imports.findMany).mockResolvedValue([]);

    expect(await listSpeciesImports(7)).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFishSpecies,
  deleteFishSpecies,
  fetchFishSpecies,
  fetchSpeciesImports,
  normalizeFishSpecies,
  normalizeSpeciesImport,
  normalizeSpeciesInput,
  updateFishSpecies,
} from "@/lib/fish-species-client";

// Tests for the client-side fish species API wrappers (#201).
// fetch is stubbed: no request leaves the test.

const validRecord = {
  id: 1,
  speciesName: "Salmo trutta",
  germanName: "Bachforelle",
  family: "Salmonidae",
  catchCount: 12,
};

const fetchMock = vi.fn();

function respond(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeFishSpecies", () => {
  it("returns a clean record and drops unknown fields", () => {
    expect(normalizeFishSpecies({ ...validRecord, extra: 1 })).toEqual(
      validRecord,
    );
  });

  it("accepts null germanName and family", () => {
    expect(
      normalizeFishSpecies({ ...validRecord, germanName: null, family: null }),
    ).toEqual({ ...validRecord, germanName: null, family: null });
  });

  it("rejects non-objects", () => {
    expect(normalizeFishSpecies(null)).toBeNull();
    expect(normalizeFishSpecies("x")).toBeNull();
  });

  it("rejects missing or wrongly typed fields", () => {
    expect(normalizeFishSpecies({ ...validRecord, id: "1" })).toBeNull();
    expect(normalizeFishSpecies({ ...validRecord, catchCount: "12" })).toBeNull();
    expect(normalizeFishSpecies({ ...validRecord, germanName: 3 })).toBeNull();
    expect(
      normalizeFishSpecies({ ...validRecord, speciesName: undefined }),
    ).toBeNull();
  });
});

describe("normalizeSpeciesInput", () => {
  it("replaces a non-breaking space with a normal space", () => {
    expect(normalizeSpeciesInput("Salmo\u00A0trutta")).toBe("Salmo trutta");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSpeciesInput("  Salmo trutta  ")).toBe("Salmo trutta");
  });

  it("collapses inner whitespace", () => {
    expect(normalizeSpeciesInput("Salmo   trutta")).toBe("Salmo trutta");
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(normalizeSpeciesInput("")).toBeNull();
    expect(normalizeSpeciesInput("   ")).toBeNull();
  });

  it("returns null for non-strings and null", () => {
    expect(normalizeSpeciesInput(null)).toBeNull();
    expect(normalizeSpeciesInput(42)).toBeNull();
  });

  it("keeps a normal name unchanged", () => {
    expect(normalizeSpeciesInput("Rutilus rutilus")).toBe("Rutilus rutilus");
  });
});

describe("fetchFishSpecies", () => {
  it("requests the list without caching", async () => {
    respond({ fishSpecies: [validRecord] });

    await fetchFishSpecies();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/fish-species", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("filters out invalid entries", async () => {
    respond({ fishSpecies: [validRecord, { id: 2 }] });

    expect(await fetchFishSpecies()).toEqual([validRecord]);
  });

  it("returns an empty list for a malformed payload", async () => {
    respond({});

    expect(await fetchFishSpecies()).toEqual([]);
  });

  it("uses the server error message", async () => {
    respond({ error: "Admin access required" }, false);

    await expect(fetchFishSpecies()).rejects.toThrow("Admin access required");
  });

  it("falls back to a generic error", async () => {
    respond({}, false);

    await expect(fetchFishSpecies()).rejects.toThrow(
      "Fish species could not be loaded.",
    );
  });
});

describe("createFishSpecies", () => {
  it("POSTs the input and returns the created record", async () => {
    respond({ species: validRecord });

    const created = await createFishSpecies({
      speciesName: "Salmo trutta",
      germanName: "Bachforelle",
    });

    expect(created).toEqual(validRecord);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/fish-species",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          speciesName: "Salmo trutta",
          germanName: "Bachforelle",
        }),
      }),
    );
  });

  it("uses the server error message", async () => {
    respond({ error: "A species with this name already exists" }, false);

    await expect(
      createFishSpecies({ speciesName: "Salmo trutta" }),
    ).rejects.toThrow("A species with this name already exists");
  });

  it("falls back to a generic error", async () => {
    respond({}, false);

    await expect(
      createFishSpecies({ speciesName: "Salmo trutta" }),
    ).rejects.toThrow("Fish species could not be created.");
  });

  it("rejects an invalid record from the server", async () => {
    respond({ species: { id: 1 } });

    await expect(
      createFishSpecies({ speciesName: "Salmo trutta" }),
    ).rejects.toThrow("Invalid fish species payload");
  });
});

describe("updateFishSpecies", () => {
  it("PATCHes the given fields and returns the record", async () => {
    respond({ species: { ...validRecord, germanName: "Forelle" } });

    const updated = await updateFishSpecies(1, { germanName: "Forelle" });

    expect(updated.germanName).toBe("Forelle");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/fish-species/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ germanName: "Forelle" }),
      }),
    );
  });

  it("uses the server error message", async () => {
    respond({ error: "Fish species not found" }, false);

    await expect(updateFishSpecies(99, { family: "x" })).rejects.toThrow(
      "Fish species not found",
    );
  });

  it("falls back to a generic error", async () => {
    respond({}, false);

    await expect(updateFishSpecies(1, { family: "x" })).rejects.toThrow(
      "Fish species could not be updated.",
    );
  });
});

describe("deleteFishSpecies", () => {
  it("resolves on success", async () => {
    respond({ message: "Fish species deleted successfully" });

    await expect(deleteFishSpecies(1)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/fish-species/1", {
      method: "DELETE",
    });
  });

  it("surfaces the server message verbatim, including the catch count", async () => {
    respond({ error: "Species is used by 12 catches", catchCount: 12 }, false);

    await expect(deleteFishSpecies(1)).rejects.toThrow(
      "Species is used by 12 catches",
    );
  });

  it("keeps the fallback message when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });

    await expect(deleteFishSpecies(1)).rejects.toThrow(
      "Fish species could not be deleted.",
    );
  });
});

describe("normalizeSpeciesImport", () => {
  const validImport = {
    id: "imp-1",
    fileName: "2026_B.xlsx",
    createdAt: "2026-11-14T10:00:00.000Z",
    importedByUsername: "georg",
    importedByName: "Georg Ernst Graf",
  };

  it("returns a clean record and drops unknown fields", () => {
    expect(normalizeSpeciesImport({ ...validImport, extra: 1 })).toEqual(
      validImport,
    );
  });

  it("accepts a null name", () => {
    expect(
      normalizeSpeciesImport({ ...validImport, importedByName: null }),
    ).toEqual({ ...validImport, importedByName: null });
  });

  it("rejects non-objects and missing or mistyped fields", () => {
    expect(normalizeSpeciesImport(null)).toBeNull();
    expect(normalizeSpeciesImport("2026_B.xlsx")).toBeNull();
    expect(normalizeSpeciesImport({ ...validImport, id: 1 })).toBeNull();
    expect(
      normalizeSpeciesImport({ ...validImport, createdAt: 1763121600000 }),
    ).toBeNull();
    expect(
      normalizeSpeciesImport({ ...validImport, importedByUsername: null }),
    ).toBeNull();
    expect(
      normalizeSpeciesImport({ ...validImport, importedByName: 42 }),
    ).toBeNull();
  });
});

describe("fetchSpeciesImports", () => {
  it("GETs the species' imports and returns them", async () => {
    respond({
      imports: [
        {
          id: "imp-1",
          fileName: "2026_B.xlsx",
          createdAt: "2026-11-14T10:00:00.000Z",
          importedByUsername: "georg",
          importedByName: "Georg Ernst Graf",
        },
      ],
    });

    const imports = await fetchSpeciesImports(7);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/fish-species/7/imports",
      { method: "GET", cache: "no-store" },
    );
    expect(imports).toEqual([
      {
        id: "imp-1",
        fileName: "2026_B.xlsx",
        createdAt: "2026-11-14T10:00:00.000Z",
        importedByUsername: "georg",
        importedByName: "Georg Ernst Graf",
      },
    ]);
  });

  it("drops malformed entries instead of failing the whole list", async () => {
    respond({ imports: [{ id: "broken" }] });

    await expect(fetchSpeciesImports(7)).resolves.toEqual([]);
  });

  it("returns an empty list when the payload has no imports array", async () => {
    respond({});

    await expect(fetchSpeciesImports(7)).resolves.toEqual([]);
  });

  it("uses the server error message", async () => {
    respond({ error: "Fish species not found" }, false);

    await expect(fetchSpeciesImports(99)).rejects.toThrow(
      "Fish species not found",
    );
  });

  it("falls back to a generic error", async () => {
    respond({}, false);

    await expect(fetchSpeciesImports(7)).rejects.toThrow(
      "Imports of this species could not be loaded.",
    );
  });
});

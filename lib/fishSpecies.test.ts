import { describe, expect, it } from "vitest";
import {
  mergeArtliste,
  normalizeSpeciesName,
  type SpeciesMasterRow,
} from "./fishSpecies";

// Inline fixtures only — the Excel file itself is never read in tests (#112).

const seed = (id: number, speciesName: string): SpeciesMasterRow => ({
  id,
  speciesName,
  germanName: "",
  family: null,
});

const excel = (scientificName: string, germanName = "", family: string | null = null) => ({
  scientificName,
  germanName,
  family,
});

describe("normalizeSpeciesName", () => {
  it("is case-insensitive and collapses whitespace", () => {
    expect(normalizeSpeciesName("  Salmo   trutta ")).toBe(
      normalizeSpeciesName("salmo trutta"),
    );
  });

  it("unifies NBSP, multiplication sign and hybrid spellings", () => {
    expect(normalizeSpeciesName("Salvelinus\u00A0fontinalis\u00D7Salvelinus umbla")).toBe(
      normalizeSpeciesName("salvelinus fontinalis x salvelinus umbla"),
    );
    expect(normalizeSpeciesName("Leuciscus aspius hyb")).toBe(
      normalizeSpeciesName("Leuciscus aspius hybrid"),
    );
    expect(normalizeSpeciesName("Rutilus rutilus x Abramis brama (hybrid)")).toBe(
      normalizeSpeciesName("Rutilus rutilus x Abramis brama"),
    );
  });
});

describe("mergeArtliste", () => {
  it("updates matched entries from the Excel (names are binding)", () => {
    const result = mergeArtliste(
      [seed(1, "Cottus gobio")],
      [excel("Cottus gobio", "Koppe", "Cottidae")],
      { aliases: {}, merges: [] },
    );

    expect(result.entries).toEqual([
      { id: 1, speciesName: "Cottus gobio", germanName: "Koppe", family: "Cottidae" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.report).toEqual({
      added: 0,
      removed: 0,
      updated: 1,
      flagged: 0,
      excelDuplicates: [],
    });
  });

  it("keeps the id when the spelling is normalized but renames to the Excel name", () => {
    const result = mergeArtliste(
      [seed(59, "Leuciscus aspius hyb")],
      [excel("Leuciscus aspius hybrid", "Schied-Hybrid", "Leuciscidae")],
      { aliases: {}, merges: [] },
    );

    expect(result.entries[0].id).toBe(59);
    expect(result.entries[0].speciesName).toBe("Leuciscus aspius hybrid");
    expect(result.entries[0].germanName).toBe("Schied-Hybrid");
  });

  it("resolves an alias to the Excel name while keeping the id", () => {
    const result = mergeArtliste(
      [seed(106, "Salvelinus fontinalis × Salvelinus umbla")],
      [excel("Salvelinus alpinus x Salvelinus fontinalis", "Elsässer", "Salmonidae")],
      { aliases: { 106: "Salvelinus alpinus x Salvelinus fontinalis" }, merges: [] },
    );

    expect(result.entries).toEqual([
      {
        id: 106,
        speciesName: "Salvelinus alpinus x Salvelinus fontinalis",
        germanName: "Elsässer",
        family: "Salmonidae",
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("flags seed entries without an Excel counterpart instead of dropping them", () => {
    const result = mergeArtliste(
      [seed(44, "Gobio obtusirostris"), seed(1, "Rutilus rutilus")],
      [excel("Rutilus rutilus", "Rotauge", "Leuciscidae")],
      { aliases: {}, merges: [] },
    );

    expect(result.entries).toEqual([
      {
        id: 44,
        speciesName: "Gobio obtusirostris",
        germanName: "",
        family: null,
        notInArtliste: true,
      },
      { id: 1, speciesName: "Rutilus rutilus", germanName: "Rotauge", family: "Leuciscidae" },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.report.flagged).toBe(1);
  });

  it("applies a merge directive: the dropped id disappears, the target is updated", () => {
    const result = mergeArtliste(
      [
        seed(90, "Rutilus hybrid"),
        { ...seed(93, "Rutilus rutilus hybrid"), germanName: "Rotauge-Hybrid" },
      ],
      [excel("Rutilus rutilus hybrid", "Rotauge Hybrid", "Leuciscidae")],
      { aliases: {}, merges: [{ dropId: 90, intoId: 93 }] },
    );

    expect(result.entries).toEqual([
      {
        id: 93,
        speciesName: "Rutilus rutilus hybrid",
        germanName: "Rotauge Hybrid",
        family: "Leuciscidae",
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.report.removed).toBe(1);
  });

  it("assigns new ids above the highest existing one, in Excel row order", () => {
    const result = mergeArtliste(
      [{ ...seed(125, "unknown"), germanName: "Unbekannt" }],
      [excel("unknown", "unknown"), excel("Salmo salar", "Lachs", "Salmonidae"), excel("Salmo salar", "Lachs", "Salmonidae")],
      { aliases: {}, merges: [] },
    );

    expect(result.entries).toEqual([
      { id: 125, speciesName: "unknown", germanName: "unknown", family: null },
      { id: 126, speciesName: "Salmo salar", germanName: "Lachs", family: "Salmonidae" },
    ]);
    expect(result.report.added).toBe(1);
    expect(result.report.excelDuplicates).toEqual(["Salmo salar"]);
    expect(result.errors).toEqual([]);
  });

  it("fails on an alias that does not exist in the Excel", () => {
    const result = mergeArtliste([seed(60, "Leuciscus aspius/idus hyb")], [excel("unknown")], {
      aliases: { 60: "Aspius aspius x Leuciscus idus" },
      merges: [],
    });

    expect(result.errors).toEqual([
      expect.stringContaining("alias for id 60"),
    ]);
  });

  it("fails when two seed ids normalize to the same Excel name without a directive", () => {
    const result = mergeArtliste(
      [seed(90, "Rutilus hybrid"), seed(93, "Rutilus rutilus hybrid")],
      [excel("Rutilus rutilus hybrid", "Rotauge Hybrid", "Leuciscidae")],
      { aliases: { 90: "Rutilus rutilus hybrid" }, merges: [] },
    );

    expect(result.errors).toEqual([expect.stringContaining("Rutilus rutilus hybrid")]);
    expect(result.errors[0]).toContain("90");
    expect(result.errors[0]).toContain("93");
  });

  it("fails when a merge directive target is not in the seed", () => {
    const result = mergeArtliste([seed(1, "Rutilus rutilus")], [excel("Rutilus rutilus")], {
      aliases: {},
      merges: [{ dropId: 90, intoId: 93 }],
    });

    expect(result.errors).toEqual([expect.stringContaining("93")]);
  });

  it("tolerates an already-applied merge directive (idempotent re-runs)", () => {
    // id 90 is gone from the master; the directive is a no-op now.
    const result = mergeArtliste([seed(93, "Rutilus rutilus hybrid")], [excel("Rutilus rutilus hybrid")], {
      aliases: {},
      merges: [{ dropId: 90, intoId: 93 }],
    });

    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { id: 93, speciesName: "Rutilus rutilus hybrid", germanName: "", family: null },
    ]);
  });

  it("does not let a merge directive excuse an unrelated duplicate", () => {
    // ids 93 and 94 normalize to the same name; the directive folds 90 into
    // 93 but does not cover the 93/94 collision.
    const result = mergeArtliste(
      [seed(90, "Rutilus hybrid"), seed(93, "Rutilus rutilus hyb"), seed(94, "Rutilus rutilus hybrid")],
      [excel("Rutilus rutilus hybrid", "Rotauge Hybrid", "Leuciscidae")],
      { aliases: { 90: "Rutilus rutilus hybrid" }, merges: [{ dropId: 90, intoId: 93 }] },
    );

    expect(result.errors).toEqual([expect.stringContaining("93, 94")]);
  });
});

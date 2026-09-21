import { describe, expect, it } from "vitest";
import { buildSchema, normalize } from "@/services/uploadService";

// Sample tests for the Excel-upload validation (#112).
// Pure logic (string normalization + Zod schema): no database, no MinIO.

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

describe("normalize", () => {
  it("trims and lowercases strings", () => {
    expect(normalize(" Austria ")).toBe("austria");
  });

  it("maps nullish values to an empty string", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});

describe("buildSchema", () => {
  it("accepts a minimal valid row without a List sheet", () => {
    expect(buildSchema({}).safeParse(validRow).success).toBe(true);
  });

  it("rejects a row with an empty required field", () => {
    expect(
      buildSchema({}).safeParse({ ...validRow, river_name: "" }).success,
    ).toBe(false);
  });

  it("rejects a year outside 1990-2100", () => {
    expect(buildSchema({}).safeParse({ ...validRow, year: 1800 }).success).toBe(
      false,
    );
  });

  it("rejects Austrian coordinates outside Austria", () => {
    const result = buildSchema({}).safeParse({ ...validRow, lat_up: 50 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "lat_up"),
      ).toBe(true);
    }
  });

  it("accepts the same coordinates for other countries", () => {
    const result = buildSchema({}).safeParse({
      ...validRow,
      country: "Germany",
      lat_up: 50,
    });
    expect(result.success).toBe(true);
  });

  it("enforces List sheet values when a list is present", () => {
    const schema = buildSchema({ country: new Set(["austria"]) });
    expect(
      schema.safeParse({ ...validRow, country: "Austria" }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...validRow, country: "Germany" }).success,
    ).toBe(false);
  });
});

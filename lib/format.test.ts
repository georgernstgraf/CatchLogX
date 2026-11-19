import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime, plural } from "@/lib/format";

describe("plural (#237)", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "catch")).toBe("1 catch");
    expect(plural(1, "file")).toBe("1 file");
  });

  it("adds -es after s, sh, ch, x and z", () => {
    expect(plural(6, "catch")).toBe("6 catches");
    expect(plural(2, "box")).toBe("2 boxes");
    expect(plural(0, "class")).toBe("0 classes");
  });

  it("adds -s otherwise", () => {
    expect(plural(3, "file")).toBe("3 files");
    expect(plural(6, "row")).toBe("6 rows");
    expect(plural(0, "sampling")).toBe("0 samplings");
  });
});

describe("formatDateTime (#238)", () => {
  beforeEach(() => vi.stubEnv("TZ", "Europe/Vienna"));
  afterEach(() => vi.unstubAllEnvs());

  it("formats an ISO timestamp as de-AT date and time", () => {
    expect(formatDateTime("2026-11-18T13:14:29.481Z")).toBe("18.11.2026, 14:14");
  });

  it("never returns the raw ISO string", () => {
    expect(formatDateTime("2026-11-18T13:14:29.481Z")).not.toContain("T13");
  });

  it("returns Unknown for an invalid value", () => {
    expect(formatDateTime("not a date")).toBe("Unknown");
  });
});

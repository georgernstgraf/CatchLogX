import { describe, expect, it } from "vitest";
import { escapeCsv } from "@/lib/csv";

// Tests for the CSV cell escaping used by the SQL query export (#119).

describe("escapeCsv", () => {
  it("neutralizes values that start like a formula", () => {
    expect(escapeCsv("=1+1")).toBe("'=1+1");
    expect(escapeCsv("+1+1")).toBe("'+1+1");
    expect(escapeCsv("-1+1")).toBe("'-1+1");
    expect(escapeCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsv("\t=1+1")).toBe("'\t=1+1");
  });

  it("neutralizes and quotes formulas containing separators", () => {
    expect(escapeCsv("=SUM(A1,B1)")).toBe(`"'=SUM(A1,B1)"`);
    expect(escapeCsv('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(escapeCsv("\r=1+1")).toBe(`"'\r=1+1"`);
  });

  it("escapes commas, quotes and line breaks as before", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsv("plain")).toBe("plain");
  });

  it("keeps numbers and numeric strings unchanged", () => {
    expect(escapeCsv(-5)).toBe("-5");
    expect(escapeCsv(3.5)).toBe("3.5");
    expect(escapeCsv(BigInt(-7))).toBe("-7");
    expect(escapeCsv("-3.5")).toBe("-3.5");
    expect(escapeCsv("+42")).toBe("+42");
    expect(escapeCsv("-1e5")).toBe("-1e5");
  });

  it("returns an empty string for null and undefined", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });
});

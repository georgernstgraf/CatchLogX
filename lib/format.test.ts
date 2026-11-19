import { describe, expect, it } from "vitest";
import { plural } from "@/lib/format";

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

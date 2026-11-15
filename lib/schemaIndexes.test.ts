import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Structural guard for performance-critical indexes (#211).
 *
 * An index is a database property: no unit test in this repository can observe
 * that `FishCatch.samplingId` is indexed, because there is no database in the
 * suite. Without this guard, dropping the line would leave every test green and
 * only surface in production as a quadratic delete (measured 2026-11-15: a
 * `DELETE` wipe over 464 654 catches / 10 497 samplings took ~6 minutes, with
 * the foreign-key check seq-scanning the catch table once per sampling).
 *
 * The behavioural evidence lives in `docs/ai/PITFALLS.md` and issue #211:
 * `EXPLAIN` on the check query, and delete timings before/after.
 */
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

/** The `model X { … }` block of the Prisma schema, without the trailing brace. */
function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  if (start === -1) throw new Error(`model ${name} not found in prisma/schema.prisma`);

  const end = schema.indexOf("\n}", start);
  if (end === -1) throw new Error(`model ${name} is not closed`);

  return schema.slice(start, end);
}

describe("Prisma schema indexes", () => {
  it("indexes FishCatch.samplingId (foreign-key check on sampling delete, #211)", () => {
    expect(modelBlock("FishCatch")).toContain("@@index([samplingId])");
  });

  it("keeps the PIT index on FishCatch.pitDec (#184)", () => {
    expect(modelBlock("FishCatch")).toContain("@@index([pitDec])");
  });

  it("keeps the import index on Sampling.importId (#202)", () => {
    expect(modelBlock("Sampling")).toContain("@@index([importId])");
  });

  it("reads real blocks, so a renamed model fails loudly", () => {
    expect(() => modelBlock("NoSuchModel")).toThrow(/not found/);
  });
});

import { describe, expect, it, vi } from "vitest";

// Tests for the SQL guard used by the query UI (#112).
// Prisma is mocked: no database — safe for `npm test` and the pre-push hook.
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRawUnsafe: vi.fn() } }));

import { prisma } from "@/lib/prisma";
import { executeQuery, validateSQLQuery } from "@/services/queryService";

describe("validateSQLQuery", () => {
  it("accepts a plain SELECT query", () => {
    expect(validateSQLQuery("SELECT * FROM FishCatch").isValid).toBe(true);
  });

  it("accepts lowercase SELECT queries", () => {
    expect(validateSQLQuery("select speciesName from FishSpecies").isValid).toBe(
      true,
    );
  });

  it("accepts balanced parentheses", () => {
    expect(
      validateSQLQuery("SELECT * FROM FishCatch WHERE (weight > 1)").isValid,
    ).toBe(true);
  });

  it("rejects empty and blank queries", () => {
    expect(validateSQLQuery("").isValid).toBe(false);
    expect(validateSQLQuery("   ").isValid).toBe(false);
  });

  it("rejects non-SELECT statements", () => {
    const result = validateSQLQuery("UPDATE FishCatch SET weight = 1");
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/SELECT/i);
  });

  it("rejects dangerous keywords case-insensitively", () => {
    for (const statement of [
      "DROP TABLE FishCatch",
      "drop table FishCatch",
      "DELETE FROM FishCatch",
      "INSERT INTO FishCatch (weight) VALUES (1)",
    ]) {
      expect(validateSQLQuery(statement).isValid).toBe(false);
    }
  });

  it("rejects queries touching protected tables", () => {
    for (const table of ["User", "Session", "PasswordResets", "Uploads"]) {
      expect(validateSQLQuery(`SELECT * FROM ${table}`).isValid).toBe(false);
    }
  });

  it("rejects unbalanced parentheses", () => {
    const result = validateSQLQuery(
      "SELECT * FROM FishCatch WHERE (weight > 1",
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/Klammern/);
  });

  it("rejects non-string input", () => {
    expect(validateSQLQuery(undefined as any).isValid).toBe(false);
    expect(validateSQLQuery(42 as any).isValid).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(validateSQLQuery("  \n SELECT 1  ").isValid).toBe(true);
  });

  it("rejects queries that do not start with SELECT", () => {
    const result = validateSQLQuery("WITH x AS (SELECT 1) SELECT * FROM x");
    expect(result).toEqual({
      isValid: false,
      error: "Nur SELECT-Queries sind erlaubt",
    });
  });

  // Blocked words are matched as whole words only (#116).
  it.each([
    'SELECT "createdAt" FROM "FishCatch"',
    'SELECT "updatedAt" FROM "FishCatch"',
    "SELECT username FROM FishCatch",
    "SELECT usersCount, dropRate FROM FishCatch",
  ])("accepts column names containing blocked words: %s", (query) => {
    expect(validateSQLQuery(query)).toEqual({ isValid: true });
  });

  it.each([
    ['SELECT * FROM "User"', "USER"],
    ["SELECT * FROM public.Session", "SESSION"],
    ["SELECT 1; DROP TABLE FishCatch", "DROP"],
    ["SELECT 1;delete from FishCatch", "DELETE"],
  ])("still rejects %s", (query, word) => {
    const result = validateSQLQuery(query);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(word);
  });
});

describe("executeQuery", () => {
  it("serializes BigInt values and echoes the query", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
      { id: 1, count: BigInt(12345678901234) },
    ]);

    const result = await executeQuery("SELECT 1");

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(result.query).toBe("SELECT 1");
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.result).toEqual([{ id: 1, count: "12345678901234" }]);
  });

  it("propagates DB errors", async () => {
    vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(new Error("syntax"));
    await expect(executeQuery("SELECT x")).rejects.toThrow("syntax");
  });
});

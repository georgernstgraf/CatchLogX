import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the query service (#112, #121).
// Both Prisma clients are mocked: no database — safe for `npm test` and the pre-push hook.
// Since #121 the security boundary is the read-only DB role, not keyword heuristics.
const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: vi.fn(), queryLog: { create: vi.fn() } },
}));
vi.mock("@/lib/queryPrisma", () => ({
  getQueryPrisma: () => ({ $queryRawUnsafe: queryRaw }),
}));

import { prisma } from "@/lib/prisma";
import {
  executeQuery,
  isPermissionDenied,
  validateSQLQuery,
} from "@/services/queryService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.queryLog.create).mockResolvedValue({} as any);
});

describe("validateSQLQuery", () => {
  it("accepts a plain SELECT query", () => {
    expect(validateSQLQuery("SELECT * FROM fish_catches").isValid).toBe(true);
  });

  it("rejects empty and blank queries", () => {
    expect(validateSQLQuery("").isValid).toBe(false);
    expect(validateSQLQuery("   ").isValid).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(validateSQLQuery(undefined as any).isValid).toBe(false);
    expect(validateSQLQuery(42 as any).isValid).toBe(false);
  });

  // The heuristics are gone (#121): the DB role decides, so these must reach the database.
  it.each([
    "WITH x AS (SELECT 1) SELECT * FROM x",
    'SELECT * FROM "User"',
    "DROP TABLE fish_catches",
    'SELECT "createdAt" FROM fish_catches',
  ])("no longer blocks by keyword: %s", (query) => {
    expect(validateSQLQuery(query)).toEqual({ isValid: true });
  });
});

describe("executeQuery", () => {
  it("runs on the read-only client and serializes BigInt values", async () => {
    queryRaw.mockResolvedValue([{ id: 1, count: BigInt(12345678901234) }]);

    const result = await executeQuery("SELECT 1", "user-1");

    expect(queryRaw).toHaveBeenCalledWith("SELECT 1");
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(result.query).toBe("SELECT 1");
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.result).toEqual([{ id: 1, count: "12345678901234" }]);
  });

  it("logs the exact query text on success", async () => {
    const query = "  select *\n from fish_species -- comment ";
    queryRaw.mockResolvedValue([{ a: 1 }, { a: 2 }]);

    await executeQuery(query, "user-1");

    expect(prisma.queryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        query,
        success: true,
        rowCount: 2,
        durationMs: expect.any(Number),
      }),
    });
  });

  it("logs failures and propagates DB errors", async () => {
    queryRaw.mockRejectedValue(new Error("permission denied for table User"));

    await expect(executeQuery('SELECT * FROM "User"', "user-1")).rejects.toThrow(
      "permission denied",
    );
    expect(prisma.queryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        query: 'SELECT * FROM "User"',
        success: false,
        error: "permission denied for table User",
      }),
    });
  });

  it("logs the plain PostgreSQL message for Prisma raw-query errors", async () => {
    queryRaw.mockRejectedValue(
      Object.assign(new Error("Invalid `prisma.$queryRawUnsafe()` invocation: ..."), {
        code: "P2010",
        meta: { code: "42501", message: "ERROR: permission denied for table Session" },
      }),
    );

    await expect(executeQuery('SELECT * FROM "Session"', "user-1")).rejects.toThrow();
    expect(prisma.queryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: "42501: ERROR: permission denied for table Session",
      }),
    });
  });

  it("still returns the result when writing the log fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockResolvedValue([{ a: 1 }]);
    vi.mocked(prisma.queryLog.create).mockRejectedValue(new Error("db down"));

    const result = await executeQuery("SELECT 1", "user-1");

    expect(result.result).toEqual([{ a: 1 }]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("isPermissionDenied", () => {
  it("detects Prisma P2010 errors by SQLSTATE", () => {
    expect(isPermissionDenied({ code: "P2010", meta: { code: "42501" } })).toBe(true);
    expect(isPermissionDenied({ code: "P2010", meta: { code: "25006" } })).toBe(true);
  });

  it("detects permission and read-only messages", () => {
    expect(isPermissionDenied(new Error("permission denied for table User"))).toBe(true);
    expect(
      isPermissionDenied(new Error("cannot execute INSERT in a read-only transaction")),
    ).toBe(true);
  });

  it("ignores other DB errors", () => {
    expect(isPermissionDenied(new Error('syntax error at or near "FORM"'))).toBe(false);
    expect(isPermissionDenied({ code: "P2010", meta: { code: "42601" } })).toBe(false);
  });
});

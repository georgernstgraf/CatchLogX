import { beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the query service (#112, #121).
// Both Prisma clients are mocked: no database — safe for `npm test` and the pre-push hook.
// Since #121 the security boundary is the read-only DB role, not keyword heuristics.
const queryRaw = vi.fn();
const executeRaw = vi.fn();
const transaction = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: vi.fn(), queryLog: { create: vi.fn() } },
}));
vi.mock("@/lib/queryPrisma", () => ({
  getQueryPrisma: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getQueryPrisma } from "@/lib/queryPrisma";
import {
  QUERY_TIMEOUT_MS,
  executeQuery,
  isPermissionDenied,
  validateSQLQuery,
} from "@/services/queryService";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.queryLog.create).mockResolvedValue({} as any);
  // User SQL runs inside a transaction so that `SET LOCAL statement_timeout` applies to
  // exactly the connection that executes it (see executeQuery).
  executeRaw.mockResolvedValue(0);
  transaction.mockImplementation(async (fn: any) =>
    fn({ $executeRawUnsafe: executeRaw, $queryRawUnsafe: queryRaw }),
  );
  vi.mocked(getQueryPrisma).mockReturnValue({ $transaction: transaction } as any);
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

  // No keyword guard in front of the DB any more (#121): even a write reaches the
  // read-only client verbatim, and clx_readonly's missing grants reject it.
  it("hands writes and DDL unchanged to the read-only client", async () => {
    queryRaw.mockRejectedValue(new Error("permission denied for table fish_catches"));

    await expect(executeQuery("DELETE FROM fish_catches", "user-1")).rejects.toThrow(
      "permission denied",
    );
    expect(queryRaw).toHaveBeenCalledWith("DELETE FROM fish_catches");
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("fails with a clear error and no admin fallback without QUERY_DATABASE_URL", async () => {
    vi.mocked(getQueryPrisma).mockImplementation(() => {
      throw new Error("QUERY_DATABASE_URL is not set");
    });

    await expect(executeQuery("SELECT 1", "user-1")).rejects.toThrow(
      "QUERY_DATABASE_URL is not set",
    );
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.queryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        query: "SELECT 1",
        success: false,
        error: "QUERY_DATABASE_URL is not set",
      }),
    });
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

// The research group uses `clx_readonly` in psql/R too, so a role-wide
// `ALTER ROLE … SET statement_timeout` would cut their analyses. The cap belongs to the
// web page, i.e. to the connection that runs the user's SQL (#187).
describe("query timeout", () => {
  it("sets a transaction-local statement_timeout before running the user SQL", async () => {
    queryRaw.mockResolvedValue([{ a: 1 }]);

    await executeQuery("SELECT 1", "user-1");

    expect(executeRaw).toHaveBeenCalledWith(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      queryRaw.mock.invocationCallOrder[0],
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: expect.any(Number),
    });
    // Prisma must not abort before PostgreSQL's statement timeout fires.
    expect(transaction.mock.calls[0][1].timeout).toBeGreaterThan(QUERY_TIMEOUT_MS);
  });

  it("is a bounded timeout, not an unlimited one", () => {
    expect(QUERY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(QUERY_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("logs a cancelled query with the PostgreSQL SQLSTATE 57014", async () => {
    queryRaw.mockRejectedValue(
      Object.assign(new Error("Invalid `prisma.$queryRawUnsafe()` invocation: ..."), {
        code: "P2010",
        meta: { code: "57014", message: "ERROR: canceling statement due to statement timeout" },
      }),
    );

    await expect(executeQuery("SELECT pg_sleep(60)", "user-1")).rejects.toThrow();
    expect(prisma.queryLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        query: "SELECT pg_sleep(60)",
        success: false,
        error: "57014: ERROR: canceling statement due to statement timeout",
      }),
    });
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

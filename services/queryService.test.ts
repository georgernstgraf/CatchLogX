import { describe, expect, it } from "vitest";
import { validateSQLQuery } from "@/services/queryService";

// Sample tests for the SQL guard used by the query UI (#112).
// Pure logic: no database, no MinIO — safe for `npm test` and the pre-push hook.
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
});

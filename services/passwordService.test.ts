import { describe, expect, it } from "vitest";
import { createResetToken } from "@/services/passwordService";

// Sample tests for password-reset token generation (#112).
// Pure logic (crypto only): no database, no mailer — safe for the pre-push hook.
describe("createResetToken", () => {
  it("returns a 48-char hex string (24 random bytes)", () => {
    expect(createResetToken()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("generates a fresh token on every call", () => {
    expect(createResetToken()).not.toBe(createResetToken());
  });
});

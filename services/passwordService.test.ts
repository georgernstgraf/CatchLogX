import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the password-reset flow (#112).
// Prisma, bcrypt and the mailer are mocked: no database, no SMTP.
const sendMail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    passwordResets: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/mailer", () => ({
  createMailerTransporter: vi.fn(() => ({ sendMail })),
}));
vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(async (pw: string) => `hashed:${pw}`) },
}));

import { prisma } from "@/lib/prisma";
import {
  buildResetEmailHtml,
  buildResetLink,
  changePassword,
  createResetToken,
  findUserOrThrow,
  initiatePasswordReset,
  validateResetToken,
} from "@/services/passwordService";

const NOW = new Date("2025-01-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendMail.mockResolvedValue({ messageId: "m1" });
  vi.mocked(prisma.passwordResets.findMany).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createResetToken", () => {
  it("returns a 48-char hex string (24 random bytes)", () => {
    expect(createResetToken()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("generates a fresh token on every call", () => {
    expect(createResetToken()).not.toBe(createResetToken());
  });
});

describe("buildResetLink / buildResetEmailHtml", () => {
  it("points to the reset page of the configured app URL", () => {
    expect(buildResetLink("tok")).toBe(
      "https://app.test/reset-password?token=tok",
    );
  });

  it("greets the user and embeds the link", () => {
    const html = buildResetEmailHtml("alice", "https://link");
    expect(html).toContain("Hello <strong>alice</strong>");
    expect(html).toContain('href="https://link"');
    expect(html).toContain(`© ${NOW.getFullYear()} CatchLogX`);
  });
});

describe("findUserOrThrow", () => {
  it("returns the e-mail of an existing user", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "a@x.at",
    } as any);
    expect(await findUserOrThrow("alice")).toEqual({
      exists: true,
      error: undefined,
      error_message: null,
      data: { email: "a@x.at" },
    });
  });

  it("returns 404 for an unknown user", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    expect(await findUserOrThrow("bob")).toMatchObject({
      exists: false,
      error: 404,
      data: null,
    });
  });

  it("returns 500 when the DB throws", async () => {
    vi.mocked(prisma.user.findFirst).mockRejectedValue(new Error("down"));
    expect(await findUserOrThrow("alice")).toMatchObject({
      exists: null,
      error: 500,
    });
  });
});

describe("initiatePasswordReset", () => {
  const timestamp = "2025-01-15T12:00:00.000Z";

  it("stores a REQUESTED reset and mails the link", async () => {
    await initiatePasswordReset("alice", timestamp, "a@x.at");

    const created = vi.mocked(prisma.passwordResets.create).mock.calls[0][0];
    expect(created.data).toMatchObject({
      username: "alice",
      timestamp: new Date(timestamp),
      state: "REQUESTED",
    });
    const token = created.data.token as string;
    expect(token).toMatch(/^[0-9a-f]{48}$/);

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("a@x.at");
    expect(mail.html).toContain(buildResetLink(token));
    expect(mail.text).toContain(buildResetLink(token));
  });

  it("expires older resets of the same user", async () => {
    vi.mocked(prisma.passwordResets.findMany).mockResolvedValue([
      { id: 1 },
    ] as any);
    await initiatePasswordReset("alice", timestamp, "a@x.at");
    expect(prisma.passwordResets.updateMany).toHaveBeenCalledWith({
      data: { state: "EXPIRED" },
      where: { username: "alice" },
    });
  });

  it("does not touch resets when there are none", async () => {
    await initiatePasswordReset("alice", timestamp, "a@x.at");
    expect(prisma.passwordResets.updateMany).not.toHaveBeenCalled();
  });

  it("still sends the mail when the DB write fails", async () => {
    vi.mocked(prisma.passwordResets.create).mockRejectedValue(
      new Error("down"),
    );
    await initiatePasswordReset("alice", timestamp, "a@x.at");
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("rethrows mail errors", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));
    await expect(
      initiatePasswordReset("alice", timestamp, "a@x.at"),
    ).rejects.toThrow("smtp down");
  });
});

describe("validateResetToken", () => {
  it("returns null for an unknown or expired token", async () => {
    vi.mocked(prisma.passwordResets.findFirst).mockResolvedValue(null);
    expect(await validateResetToken("tok")).toBeNull();
    expect(prisma.passwordResets.update).not.toHaveBeenCalled();
  });

  it("only accepts REQUESTED tokens from the last 15 minutes", async () => {
    vi.mocked(prisma.passwordResets.findFirst).mockResolvedValue(null);
    await validateResetToken("tok");
    expect(prisma.passwordResets.findFirst).toHaveBeenCalledWith({
      where: {
        token: "tok",
        state: "REQUESTED",
        timestamp: { gte: new Date("2025-01-15T11:45:00Z") },
      },
    });
  });

  it("consumes a valid token", async () => {
    const reset = { id: 7, username: "alice", token: "tok" };
    vi.mocked(prisma.passwordResets.findFirst).mockResolvedValue(reset as any);

    expect(await validateResetToken("tok")).toBe(reset);
    expect(prisma.passwordResets.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { state: "EXPIRED" },
    });
  });
});

describe("changePassword", () => {
  it("stores the hashed password and marks the reset as done", async () => {
    await changePassword("alice", "newpw", "tok");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { username: "alice" },
      data: { hashedPassword: "hashed:newpw", isFirstLogin: false },
    });
    expect(prisma.passwordResets.update).toHaveBeenCalledWith({
      where: { token: "tok" },
      data: { state: "DONE", passwordChangedAt: NOW },
    });
  });
});

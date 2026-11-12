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
  mailFrom: vi.fn(() => '"CatchLogX" <catchlogx@boku.ac.at>'),
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
  handleForgotPassword,
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
  // clearAllMocks keeps implementations; a rejected create from one test
  // must not leak into the next.
  vi.mocked(prisma.passwordResets.create).mockResolvedValue({} as any);
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

  it("states the 10-minute validity of the link", () => {
    expect(buildResetEmailHtml("alice", "https://link")).toContain(
      "expire in 10 minutes",
    );
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
  it("stores a REQUESTED reset and mails the link", async () => {
    await initiatePasswordReset("alice", "a@x.at");

    const created = vi.mocked(prisma.passwordResets.create).mock.calls[0][0];
    expect(created.data).toMatchObject({
      username: "alice",
      state: "REQUESTED",
    });
    const token = created.data.token as string;
    expect(token).toMatch(/^[0-9a-f]{48}$/);

    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("a@x.at");
    // #160: sender comes from the mailer (NODEMAILER_FROM), not NODEMAILER_USER.
    expect(mail.from).toBe('"CatchLogX" <catchlogx@boku.ac.at>');
    expect(mail.html).toContain(buildResetLink(token));
    expect(mail.text).toContain(buildResetLink(token));
  });

  // #194: the reset time is the server clock. The client used to send it,
  // which let a caller pick a future timestamp (token never expires) and
  // produced `new Date(undefined)` when the field was missing.
  it("stamps the reset with the server clock, not a client value", async () => {
    await initiatePasswordReset("alice", "a@x.at");

    const created = vi.mocked(prisma.passwordResets.create).mock.calls[0][0];
    expect(created.data.timestamp).toEqual(NOW);
  });

  it("states the same 10-minute validity in the plain-text mail", async () => {
    await initiatePasswordReset("alice", "a@x.at");

    const mail = sendMail.mock.calls[0][0];
    expect(mail.text).toContain("expire in 10 minutes");
    expect(mail.text).not.toContain("24 hours");
  });

  it("expires older resets of the same user", async () => {
    vi.mocked(prisma.passwordResets.findMany).mockResolvedValue([
      { id: 1 },
    ] as any);
    await initiatePasswordReset("alice", "a@x.at");
    expect(prisma.passwordResets.updateMany).toHaveBeenCalledWith({
      data: { state: "EXPIRED" },
      where: { username: "alice" },
    });
  });

  it("does not touch resets when there are none", async () => {
    await initiatePasswordReset("alice", "a@x.at");
    expect(prisma.passwordResets.updateMany).not.toHaveBeenCalled();
  });

  // #194: previously the DB error was swallowed and a mail with a dead link
  // went out anyway. Without a stored token there is nothing to mail.
  it("does not send a mail when the DB write fails", async () => {
    vi.mocked(prisma.passwordResets.create).mockRejectedValue(
      new Error("down"),
    );
    await expect(initiatePasswordReset("alice", "a@x.at")).rejects.toThrow(
      "down",
    );
    expect(sendMail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[forgot-password] reset not stored for alice"),
      expect.any(Error),
    );
  });

  it("rethrows mail errors", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));
    await expect(initiatePasswordReset("alice", "a@x.at")).rejects.toThrow(
      "smtp down",
    );
  });
});

// #194: decision logic of POST /api/forgot-password, lifted out of the route
// handler so it can be tested without jsdom. The route is a thin adapter.
describe("handleForgotPassword", () => {
  const neutral =
    "If an account with this username exists, a reset link has been sent. Please check your emails.";

  it("rejects an empty or missing username with 400", async () => {
    for (const bad of ["", null, undefined, 42]) {
      const res = await handleForgotPassword(bad);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Username must not be empty.");
    }
    // `where: { username: undefined }` would match the first user.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("answers 200 with the neutral message for a known user and mails the link", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "a@x.at",
    } as any);

    const res = await handleForgotPassword("alice");

    expect(res).toEqual({ status: 200, body: { message: neutral } });
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0].to).toBe("a@x.at");
  });

  it("answers 200 with the same message for an unknown user (no enumeration)", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    const res = await handleForgotPassword("bob");

    expect(res).toEqual({ status: 200, body: { message: neutral } });
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.passwordResets.create).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('[forgot-password] unknown user "bob"'),
    );
  });

  it("answers 500 without the error object when the mail cannot be sent", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "a@x.at",
    } as any);
    sendMail.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:1"));

    const res = await handleForgotPassword("alice");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      message:
        "There was an issue while initiating your password reset. Please try again later.",
    });
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");
  });

  it("answers 500 when the token cannot be stored", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      email: "a@x.at",
    } as any);
    vi.mocked(prisma.passwordResets.create).mockRejectedValue(
      new Error("down"),
    );

    const res = await handleForgotPassword("alice");

    expect(res.status).toBe(500);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("answers 500 when the user lookup fails", async () => {
    vi.mocked(prisma.user.findFirst).mockRejectedValue(new Error("down"));

    const res = await handleForgotPassword("alice");

    expect(res.status).toBe(500);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("validateResetToken", () => {
  it("returns null for an unknown or expired token", async () => {
    vi.mocked(prisma.passwordResets.findFirst).mockResolvedValue(null);
    expect(await validateResetToken("tok")).toBeNull();
    expect(prisma.passwordResets.update).not.toHaveBeenCalled();
  });

  it("only accepts REQUESTED tokens from the last 10 minutes", async () => {
    vi.mocked(prisma.passwordResets.findFirst).mockResolvedValue(null);
    await validateResetToken("tok");
    expect(prisma.passwordResets.findFirst).toHaveBeenCalledWith({
      where: {
        token: "tok",
        state: "REQUESTED",
        timestamp: { gte: new Date("2025-01-15T11:50:00Z") },
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the SMTP config helpers (#112).
// nodemailer is mocked: no SMTP connection is ever opened.
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
}));

import nodemailer from "nodemailer";
import {
  createMailerTransporter,
  getMailerConfig,
  mailFrom,
  parseBoolean,
  parsePort,
} from "@/lib/mailer";

describe("parseBoolean", () => {
  it("accepts 'true' and '1'", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("1")).toBe(true);
  });

  it("treats everything else as false", () => {
    for (const value of [undefined, "", "false", "0", "TRUE", "yes"]) {
      expect(parseBoolean(value)).toBe(false);
    }
  });
});

describe("parsePort", () => {
  it("parses a valid port", () => {
    expect(parsePort("465")).toBe(465);
  });

  it("falls back to 587 for missing or invalid values", () => {
    for (const value of [undefined, "", "0", "-25", "abc"]) {
      expect(parsePort(value)).toBe(587);
    }
  });
});

describe("getMailerConfig / createMailerTransporter", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("NODEMAILER_HOST", "smtp.example.com");
    vi.stubEnv("NODEMAILER_USER", "bot@example.com");
    vi.stubEnv("NODEMAILER_PASSWORD", "secret");
    vi.stubEnv("NODEMAILER_SECURE", "true");
    vi.stubEnv("NODEMAILER_PORT", "465");
    vi.stubEnv("NODEMAILER_FROM", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads the config from the environment", () => {
    expect(getMailerConfig()).toEqual({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      from: "bot@example.com",
      auth: { user: "bot@example.com", pass: "secret" },
    });
  });

  it("lists every missing variable in the error", () => {
    vi.stubEnv("NODEMAILER_HOST", "");
    vi.stubEnv("NODEMAILER_USER", "");
    expect(() => getMailerConfig()).toThrow(
      "Mailer configuration missing: NODEMAILER_HOST, NODEMAILER_FROM",
    );
  });

  // #160: production relays through a loopback-only postfix on 127.0.0.1:25
  // that holds the BOKU credential itself — the app must send without auth.
  it("allows an auth-less relay when user and password are both unset", () => {
    vi.stubEnv("NODEMAILER_HOST", "127.0.0.1");
    vi.stubEnv("NODEMAILER_PORT", "25");
    vi.stubEnv("NODEMAILER_SECURE", "");
    vi.stubEnv("NODEMAILER_USER", "");
    vi.stubEnv("NODEMAILER_PASSWORD", "");
    vi.stubEnv("NODEMAILER_FROM", "catchlogx@boku.ac.at");
    expect(getMailerConfig()).toEqual({
      host: "127.0.0.1",
      port: 25,
      secure: false,
      from: "catchlogx@boku.ac.at",
      auth: undefined,
    });
  });

  it("rejects a half-configured login (user without password)", () => {
    vi.stubEnv("NODEMAILER_PASSWORD", "");
    expect(() => getMailerConfig()).toThrow(
      "Mailer configuration incomplete: NODEMAILER_USER and NODEMAILER_PASSWORD must be set together",
    );
  });

  it("rejects a half-configured login (password without user)", () => {
    vi.stubEnv("NODEMAILER_USER", "");
    vi.stubEnv("NODEMAILER_FROM", "catchlogx@boku.ac.at");
    expect(() => getMailerConfig()).toThrow(/must be set together/);
  });

  it("prefers NODEMAILER_FROM over NODEMAILER_USER as sender", () => {
    vi.stubEnv("NODEMAILER_FROM", "catchlogx@boku.ac.at");
    expect(getMailerConfig().from).toBe("catchlogx@boku.ac.at");
  });

  it("formats the sender with the display name", () => {
    vi.stubEnv("NODEMAILER_FROM", "catchlogx@boku.ac.at");
    expect(mailFrom()).toBe('"CatchLogX" <catchlogx@boku.ac.at>');
  });

  it("falls back to NODEMAILER_USER as sender for existing envs", () => {
    expect(mailFrom()).toBe('"CatchLogX" <bot@example.com>');
  });

  it("creates a transport without auth for the loopback relay", () => {
    vi.mocked(nodemailer.createTransport).mockClear();
    vi.stubEnv("NODEMAILER_HOST", "127.0.0.1");
    vi.stubEnv("NODEMAILER_PORT", "25");
    vi.stubEnv("NODEMAILER_SECURE", "");
    vi.stubEnv("NODEMAILER_USER", "");
    vi.stubEnv("NODEMAILER_PASSWORD", "");
    vi.stubEnv("NODEMAILER_FROM", "catchlogx@boku.ac.at");
    createMailerTransporter("test");
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "127.0.0.1",
      port: 25,
      secure: false,
    });
  });

  it("creates a transport with the resolved config", () => {
    createMailerTransporter("test");
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "bot@example.com", pass: "secret" },
    });
  });

  it("throws before creating a transport when config is missing", () => {
    vi.mocked(nodemailer.createTransport).mockClear();
    vi.stubEnv("NODEMAILER_USER", "");
    // No user and no NODEMAILER_FROM → no sender left (#160).
    expect(() => createMailerTransporter("test")).toThrow(/NODEMAILER_FROM/);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});

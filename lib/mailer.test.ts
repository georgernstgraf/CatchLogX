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
      user: "bot@example.com",
      password: "secret",
    });
  });

  it("lists every missing variable in the error", () => {
    vi.stubEnv("NODEMAILER_HOST", "");
    vi.stubEnv("NODEMAILER_PASSWORD", "");
    expect(() => getMailerConfig()).toThrow(
      "Mailer configuration missing: NODEMAILER_HOST, NODEMAILER_PASSWORD",
    );
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
    expect(() => createMailerTransporter("test")).toThrow(/NODEMAILER_USER/);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});

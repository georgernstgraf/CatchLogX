import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  /** Bare sender address (NODEMAILER_FROM, falls back to NODEMAILER_USER). */
  from: string;
  /** Undefined for an auth-less relay, e.g. the loopback postfix on prod (#160). */
  auth: { user: string; pass: string } | undefined;
};

// Exported for unit tests (see lib/mailer.test.ts, #112).
export function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export function parsePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

export function getMailerConfig(): MailerConfig {
  const host = process.env.NODEMAILER_HOST ?? "";
  const user = process.env.NODEMAILER_USER ?? "";
  const password = process.env.NODEMAILER_PASSWORD ?? "";
  // The relay may only accept its own account as sender (BOKU IronPort, see
  // deploy/prod/postfix/README.md), so the sender is configurable on its own.
  // Falling back to NODEMAILER_USER keeps existing envs working.
  const from = process.env.NODEMAILER_FROM || user;
  const secure = parseBoolean(process.env.NODEMAILER_SECURE);
  const port = parsePort(process.env.NODEMAILER_PORT);

  const missing = [
    !host && "NODEMAILER_HOST",
    !from && "NODEMAILER_FROM",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Mailer configuration missing: ${missing.join(", ")}`);
  }

  // Both set → authenticated SMTP; both unset → auth-less relay (#160).
  // Exactly one set is almost certainly a typo and would silently send
  // without auth, so refuse it.
  if (Boolean(user) !== Boolean(password)) {
    throw new Error(
      "Mailer configuration incomplete: NODEMAILER_USER and NODEMAILER_PASSWORD must be set together",
    );
  }

  return {
    host,
    port,
    secure,
    from,
    auth: user ? { user, pass: password } : undefined,
  };
}

/** Sender header for every outgoing mail, e.g. `"CatchLogX" <catchlogx@boku.ac.at>`. */
export function mailFrom(): string {
  return `"CatchLogX" <${getMailerConfig().from}>`;
}

export function createMailerTransporter(context: string) {
  const config = getMailerConfig();

  console.info(
    `[mailer] (${context}) using SMTP host=${config.host} port=${config.port} secure=${config.secure} auth=${config.auth ? "yes" : "no"}`,
  );

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.auth && { auth: config.auth }),
  } as SMTPTransport.Options);
}

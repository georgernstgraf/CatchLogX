import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

type MailerConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

function parseBoolean(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
}

function getMailerConfig(): MailerConfig {
  const host = process.env.NODEMAILER_HOST ?? "";
  const user = process.env.NODEMAILER_USER ?? "";
  const password = process.env.NODEMAILER_PASSWORD ?? "";
  const secure = parseBoolean(process.env.NODEMAILER_SECURE);
  const port = parsePort(process.env.NODEMAILER_PORT);

  const missing = [
    !host && "NODEMAILER_HOST",
    !user && "NODEMAILER_USER",
    !password && "NODEMAILER_PASSWORD",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Mailer configuration missing: ${missing.join(", ")}`);
  }

  return {
    host,
    port,
    secure,
    user,
    password,
  };
}

export function createMailerTransporter(context: string) {
  const config = getMailerConfig();

  console.info(
    `[mailer] (${context}) using SMTP host=${config.host} port=${config.port} secure=${config.secure}`,
  );

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
  } as SMTPTransport.Options);
}

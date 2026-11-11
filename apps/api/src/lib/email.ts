import nodemailer, { type Transporter } from "nodemailer";
import type { FastifyBaseLogger } from "fastify";

// Outgoing email over SMTP (Microsoft 365: smtp.office365.com:587 with a mailbox that may send).
// When SMTP_HOST is not set, nothing is sent and notifications stay in the app only.

const HOST = process.env["SMTP_HOST"] ?? "";
const PORT = Number(process.env["SMTP_PORT"] ?? 587);
const USER = process.env["SMTP_USER"] ?? "";
const PASS = process.env["SMTP_PASS"] ?? "";
const FROM = process.env["SMTP_FROM"] ?? USER;
export const APP_URL = (process.env["APP_URL"] ?? "http://localhost:5173").replace(/\/$/, "");

let transport: Transporter | null = null;

export function emailEnabled(): boolean {
  return Boolean(HOST && FROM);
}

function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      ...(USER ? { auth: { user: USER, pass: PASS } } : {}),
    });
  }
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Best effort: logs and swallows failures so a mail outage never breaks a workflow action. */
export async function sendEmail(
  log: FastifyBaseLogger,
  to: string[],
  subject: string,
  text: string,
  link?: string | null,
): Promise<void> {
  if (!emailEnabled() || to.length === 0) return;
  const url = link ? `${APP_URL}${link}` : APP_URL;
  try {
    await getTransport().sendMail({
      from: FROM,
      bcc: to, // recipients don't see each other
      subject: `[Integer ERP] ${subject}`,
      text: `${text}\n\nOpen in Integer ERP: ${url}`,
      html: `<p>${esc(text).replace(/\n/g, "<br>")}</p><p><a href="${esc(url)}">Open in Integer ERP</a></p>`,
    });
  } catch (err) {
    log.error({ err, subject }, "Email send failed");
  }
}

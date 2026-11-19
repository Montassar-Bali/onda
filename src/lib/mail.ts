import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Transporter } from "nodemailer";
import { prisma } from "./db";

/**
 * Email delivery.
 *  - Every message is recorded in email_outbox (auditable), then delivered.
 *  - SMTP_URL set     → sent through that SMTP server (Brevo, Resend, Mailgun, SES, Gmail…).
 *  - no SMTP_URL, dev → written as a real .eml file in ./.mail-outbox (open it in Mail/Outlook), not sent.
 *  - production       → SMTP_URL is mandatory (the server refuses to start without it, see lib/env.ts).
 * Emails NEVER contain a national ID: templates only select name/email/ticket fields.
 */
export interface MailAttachment { filename: string; content: Buffer; contentType: string; cid?: string }
export interface MailMessage { to: string; subject: string; html: string; text: string; attachments?: MailAttachment[] }
export interface MailResult { to: string; status: "SENT" | "SAVED_LOCALLY" | "FAILED"; error?: string }

let transport: Transporter | null = null;
async function smtp(): Promise<Transporter> {
  if (!transport) {
    const nodemailer = await import("nodemailer");
    transport = nodemailer.createTransport(process.env.SMTP_URL!);
  }
  return transport;
}

const from = () => process.env.MAIL_FROM || "ONDA Tickets <no-reply@localhost>";

export async function sendEmail(m: MailMessage): Promise<MailResult> {
  const row = await prisma.emailOutbox.create({ data: { to: m.to, subject: m.subject, html: m.html } });
  const mail = { from: from(), to: m.to, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })) };
  try {
    if (process.env.SMTP_URL) {
      await (await smtp()).sendMail(mail);
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
      return { to: m.to, status: "SENT" };
    }
    if (process.env.NODE_ENV === "development") {
      const nodemailer = await import("nodemailer");
      const info = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" }).sendMail(mail);
      const dir = path.join(process.cwd(), ".mail-outbox");
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${row.id.slice(0, 8)}.eml`);
      await writeFile(file, info.message as Buffer);
      console.info(`[mail] no SMTP_URL — saved ${path.relative(process.cwd(), file)} (to ${m.to})`);
    }
    return { to: m.to, status: "SAVED_LOCALLY" };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { error } });
    console.error(`[mail] delivery to ${m.to} failed: ${error}`);
    return { to: m.to, status: "FAILED", error };
  }
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

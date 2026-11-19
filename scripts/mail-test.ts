/** Sends one test email through SMTP_URL to check the mail setup:  npm run mail:test -- you@example.com */
import { sendEmail } from "../src/lib/mail";
import { prisma } from "../src/lib/db";

const to = process.argv[2];
if (!to || !to.includes("@")) { console.error("Usage: npm run mail:test -- you@example.com"); process.exit(1); }
if (!process.env.SMTP_URL) { console.error("SMTP_URL is empty in .env — add your Brevo SMTP details first."); process.exit(1); }
sendEmail({
  to,
  subject: "ONDA — test email",
  html: "<p>If you can read this, ONDA ticket emails are working.</p>",
  text: "If you can read this, ONDA ticket emails are working.",
}).then((r) => {
  console.log(r.status === "SENT" ? `Sent to ${to} — check the inbox (and spam folder).` : `Failed: ${r.error}`);
  process.exitCode = r.status === "SENT" ? 0 : 1;
}).finally(() => prisma.$disconnect());

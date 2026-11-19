// Interactive Gmail setup: asks for the address and App Password (hidden), writes SMTP_URL and MAIL_FROM
// into .env, then sends a test email. Run:  npm run setup-email
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import readline from "node:readline";

const ask = (q, hidden = false) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => write(s.startsWith(q) ? s : s.replace(/[^\r\n]/g, "*"));
  }
  rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
});

const email = (await ask("Gmail address: ")).toLowerCase();
if (!/^[^\s@]+@gmail\.com$/.test(email)) { console.error("That doesn't look like a @gmail.com address."); process.exit(1); }
const pw = (await ask("App Password (16 letters, hidden): ", true)).replace(/\s+/g, "");
if (!/^[a-z]{16}$/i.test(pw)) { console.error("An App Password is 16 letters. Create one at https://myaccount.google.com/apppasswords"); process.exit(1); }

const file = ".env";
let env = existsSync(file) ? readFileSync(file, "utf8") : "";
const set = (k, v) => {
  const line = `${k}="${v}"`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : env + (env.endsWith("\n") ? "" : "\n") + line + "\n";
};
set("SMTP_URL", `smtps://${encodeURIComponent(email)}:${pw}@smtp.gmail.com:465`);
set("MAIL_FROM", `ONDA Tickets <${email}>`);
writeFileSync(file, env);
console.log(`Saved to .env (never committed). Sending a test email to ${email}…`);

const nodemailer = (await import("nodemailer")).default;
try {
  await nodemailer.createTransport(`smtps://${encodeURIComponent(email)}:${pw}@smtp.gmail.com:465`).sendMail({
    from: `ONDA Tickets <${email}>`, to: email, subject: "ONDA — test email", text: "If you can read this, ONDA ticket emails are working.",
  });
  console.log("Sent. Check your inbox (and spam). Add the same two lines (SMTP_URL, MAIL_FROM) in Vercel → Environment Variables.");
} catch (e) {
  console.error("Gmail refused the login:", e.message, "\nCheck the App Password, or create a new one.");
  process.exit(1);
}

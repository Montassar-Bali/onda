/**
 * Production configuration guard: the server refuses to start with missing, weak or reused secrets.
 * Values are never printed — only which setting is wrong.
 */
export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  const b64key = (name: string) => {
    const v = env[name];
    if (!v) return problems.push(`${name} is not set`);
    if (Buffer.from(v, "base64").length !== 32) problems.push(`${name} must be base64 of exactly 32 random bytes (openssl rand -base64 32)`);
  };
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  else if (/@localhost:5433\/tropical(\?|$)/.test(env.DATABASE_URL)) problems.push("DATABASE_URL points at the local development database");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) problems.push("SESSION_SECRET must be at least 32 random characters");
  b64key("CIN_ENC_KEY");
  b64key("CIN_HMAC_KEY");
  const secrets = [env.SESSION_SECRET, env.CIN_ENC_KEY, env.CIN_HMAC_KEY].filter(Boolean);
  if (new Set(secrets).size !== secrets.length) problems.push("SESSION_SECRET, CIN_ENC_KEY and CIN_HMAC_KEY must all be different");
  if (!env.APP_URL?.startsWith("https://")) problems.push("APP_URL must be the public https:// address");
  if (!env.DATABASE_URL_UNPOOLED) problems.push("DATABASE_URL_UNPOOLED is not set (the unpooled database URL, used for migrations)");
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 16) problems.push("CRON_SECRET must be at least 16 random characters (protects the scheduled jobs)");
  if (!env.SMTP_URL) problems.push("SMTP_URL is not set — tickets are delivered by email");
  else if (!/^smtps?:\/\//.test(env.SMTP_URL)) problems.push("SMTP_URL must start with smtp:// or smtps://");
  if (problems.length) throw new Error("Refusing to start — insecure configuration:\n  - " + problems.join("\n  - "));
}

/**
 * The client IP, ONLY when it can be trusted.
 * X-Forwarded-For is set by the client too, so it is spoofable. Behind N reverse proxies that each
 * append the address they saw, the trustworthy entry is the N-th from the right.
 * On Vercel the platform's x-real-ip header is used. Elsewhere, set TRUST_PROXY_HOPS=1 when one proxy (nginx, Caddy, a load balancer) sits in front of the app.
 * Without it, this returns null and nothing keys security decisions on a forgeable header.
 */
export function clientIp(h: Headers): string | null {
  // On Vercel, x-real-ip is set by Vercel's edge from the TCP connection and cannot be forged by the client.
  if (process.env.VERCEL === "1") {
    const ip = (h.get("x-real-ip") ?? "").trim();
    return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
  }
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 1) return null;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = parts[parts.length - hops];
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

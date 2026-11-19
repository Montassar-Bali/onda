import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const deny = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** The host the browser is talking to (the proxy's, when there is one). */
const publicHost = (req: NextRequest) => (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host).split(",")[0].trim();

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // Only scripts carrying this request's nonce (and what they load) may run: injected <script> tags are refused.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── API: cross-site request forgery defences (in addition to SameSite=Strict cookies) ──
  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const site = req.headers.get("sec-fetch-site");
      if (site && site !== "same-origin" && site !== "none") return deny(403, "BAD_ORIGIN", "Cross-site request refused");
      const origin = req.headers.get("origin");
      if (origin) {
        let host = "";
        try { host = new URL(origin).host; } catch { /* malformed */ }
        if (host !== publicHost(req)) return deny(403, "BAD_ORIGIN", "Cross-origin request refused");
      }
      // Bodies must be JSON: plain HTML forms from other sites cannot send that without a CORS preflight.
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > 0 && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return deny(415, "BAD_CONTENT_TYPE", "JSON body required");
    }
    return NextResponse.next();
  }

  // ── Pages: staff areas need a signed session (the page itself re-checks the session in the database) ──
  if (pathname.startsWith("/admin") || pathname.startsWith("/team")) {
    const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!s) return NextResponse.redirect(new URL("/login", req.url));
    if (pathname.startsWith("/admin") && s.role !== "TEAM_LEADER") return NextResponse.redirect(new URL("/team", req.url));
  }

  // ── Pages: nonce-based Content-Security-Policy ──
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp); // Next.js reads the nonce from here and applies it to its own scripts
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // everything except static files, image optimisation and public assets
    { source: "/((?!_next/static|_next/image|brand/|icon.svg|manifest.webmanifest|sw.js|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};

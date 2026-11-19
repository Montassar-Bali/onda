import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/errors";
import { currentActor } from "@/server/auth";
import { matchRoute } from "@/server/routes";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/ip";

export const dynamic = "force-dynamic";

/** Largest accepted JSON body. The biggest legitimate request (a 20-person sale) is ~6 KB. */
const MAX_BODY_BYTES = 64 * 1024;

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = "/" + (await params).path.join("/");
  const ip = clientIp(req.headers);
  const m = matchRoute(req.method, path);
  if (!m) return err(404, "NOT_FOUND", "No such endpoint");
  try {
    // Public writes: 20/min per trusted IP; without a trusted IP, one shared bucket caps the total.
    if (m.route.auth === "public" && req.method !== "GET" && !(ip ? rateLimit(`pub:${ip}`, 20, 60_000) : rateLimit("pub:untrusted", 120, 60_000))) return err(429, "RATE_LIMITED", "Too many requests, try again in a minute");
    const actor = await currentActor();
    if (m.route.auth !== "public" && !actor) return err(401, "UNAUTHENTICATED", "Please sign in");
    if (m.route.auth === "leader" && actor?.role !== "TEAM_LEADER") return err(403, "FORBIDDEN", "Team Leader only");
    let body: unknown = undefined;
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return err(413, "TOO_LARGE", "Request too large");
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) return err(413, "TOO_LARGE", "Request too large");
      try { body = text ? JSON.parse(text) : {}; } catch { return err(400, "BAD_JSON", "Malformed JSON"); }
    }
    const result = await m.route.handler({ params: m.params, body, query: req.nextUrl.searchParams, actor: actor!, ip });
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return err(e.status, e.code, e.message);
    if (e instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION", message: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), issues: e.issues } }, { status: 400 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return err(409, "DUPLICATE", "This record already exists");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return err(404, "NOT_FOUND", "Not found");
    console.error(`[api] ${req.method} ${path}`, e);
    return err(500, "INTERNAL", "Unexpected error. Nothing was saved.");
  }
}

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };

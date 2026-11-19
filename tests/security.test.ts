import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cinDigest } from "@/lib/cin";
import { assertProductionEnv } from "@/lib/env";
import { sellDigitalTickets } from "@/services/sales";
import { createReservation } from "@/services/reservations";
import { activeSession, createSession, revokeAllSessions, revokeSession } from "@/services/sessions";
import { loginKey, recentLoginFailures, setUserActive, verifyCredentials } from "@/services/users";
import { clientIp } from "@/server/ip";
import { enableReservations, mkUser, person, setupEvent } from "./helpers";

describe("identity takeover protection", () => {
  it("a public reservation with someone's CIN cannot redirect their ticket emails", async () => {
    const { leader, seller, event, cat } = await setupEvent();
    await enableReservations(leader, event.id, 20);
    const victim = person("Victim Person");
    await sellDigitalTickets(seller, { eventId: event.id, categoryId: cat.id, holders: [victim], cashCollected: true, expectedUnitPriceMillimes: 25000 });
    const attacker = { ...victim, fullName: "Attacker Person", email: "attacker@evil.test", phone: "+21699999999" };
    await createReservation({ eventId: event.id, categoryId: cat.id, purchaser: attacker, attendees: [person()], acknowledgeNotATicket: true });
    const rec = await prisma.customerIdentityRecord.findUniqueOrThrow({ where: { cinHmac: cinDigest(victim.cin) } });
    expect(rec.email).toBe(victim.email);
    expect(rec.phone).toBe(victim.phone);
  });

  it("caps pending reservations per purchaser email per edition", async () => {
    const { leader, event, cat } = await setupEvent();
    await enableReservations(leader, event.id, 50);
    const email = `bomb-${Date.now()}@victim.test`;
    const mk = () => createReservation({ eventId: event.id, categoryId: cat.id, purchaser: { ...person(), email }, attendees: [person()], acknowledgeNotATicket: true });
    await mk(); await mk();
    await expect(mk()).rejects.toMatchObject({ code: "EMAIL_LIMIT" });
  });
});

describe("sessions", () => {
  it("are live until signed out, and die when the user is deactivated", async () => {
    const leader = await mkUser("TEAM_LEADER");
    const member = await mkUser("TEAM_MEMBER");
    const s1 = await createSession(member.id, null, "test");
    expect(await activeSession(s1.id, member.id)).not.toBeNull();
    expect(await activeSession(s1.id, leader.id)).toBeNull(); // session bound to its user
    await revokeSession(s1.id);
    expect(await activeSession(s1.id, member.id)).toBeNull();

    const s2 = await createSession(member.id, null, "test");
    await setUserActive(leader, member.id, false);
    expect(await activeSession(s2.id, member.id)).toBeNull();
    await prisma.user.update({ where: { id: member.id }, data: { active: true } });
    expect(await activeSession(s2.id, member.id)).toBeNull(); // reactivation does not resurrect old sessions

    const s3 = await createSession(member.id, null, "test");
    await revokeAllSessions(member.id);
    expect(await activeSession(s3.id, member.id)).toBeNull();
  });

  it("expired sessions are rejected", async () => {
    const member = await mkUser("TEAM_MEMBER");
    const s = await createSession(member.id, null, null);
    await prisma.session.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await activeSession(s.id, member.id)).toBeNull();
  });
});

describe("login hardening", () => {
  it("counts failures per email with an opaque key, the same for unknown accounts", async () => {
    const email = `nobody-${Date.now()}@t.test`;
    expect(loginKey(email)).toBe(loginKey(` ${email.toUpperCase()} `));
    expect(await verifyCredentials(email, "whatever-password")).toBeNull();
    for (let i = 0; i < 3; i++) await prisma.auditLog.create({ data: { action: "LOGIN_FAILED", entityType: "login", entityId: loginKey(email) } });
    expect(await recentLoginFailures(email)).toBe(3);
  });
});

describe("client IP", () => {
  const h = (xff: string) => new Headers({ "x-forwarded-for": xff });
  it("ignores X-Forwarded-For unless a proxy is trusted, then takes the proxy-appended entry", () => {
    const prev = process.env.TRUST_PROXY_HOPS;
    process.env.TRUST_PROXY_HOPS = "0";
    expect(clientIp(h("1.2.3.4"))).toBeNull();
    process.env.TRUST_PROXY_HOPS = "1";
    expect(clientIp(h("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9"); // the forged left part is ignored
    expect(clientIp(h("not an ip"))).toBeNull();
    process.env.TRUST_PROXY_HOPS = prev;
  });
});

describe("production configuration guard", () => {
  const good = { NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db.internal:5432/onda", SESSION_SECRET: "x".repeat(44), CIN_ENC_KEY: Buffer.alloc(32, 1).toString("base64"), CIN_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"), APP_URL: "https://tickets.example.com", SMTP_URL: "smtps://user:pass@smtp.example.com:465" } as unknown as NodeJS.ProcessEnv;
  it("accepts a sound configuration", () => expect(() => assertProductionEnv(good)).not.toThrow());
  it("refuses weak, missing or reused secrets and plain http", () => {
    expect(() => assertProductionEnv({ ...good, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => assertProductionEnv({ ...good, CIN_HMAC_KEY: good.CIN_ENC_KEY })).toThrow(/different/);
    expect(() => assertProductionEnv({ ...good, CIN_ENC_KEY: "abc" })).toThrow(/CIN_ENC_KEY/);
    expect(() => assertProductionEnv({ ...good, APP_URL: "http://tickets.example.com" })).toThrow(/https/);
    expect(() => assertProductionEnv({ ...good, SMTP_URL: "" })).toThrow(/SMTP_URL/);
    expect(() => assertProductionEnv({ ...good, DATABASE_URL: "postgresql://tropical@localhost:5433/tropical" })).toThrow(/development/);
  });
});

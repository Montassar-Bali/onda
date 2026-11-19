# Security & personal data

No system is unbreakable. This document lists every control, what it protects, and the risks that remain,
so they can be managed deliberately.

## Secrets and configuration
- Secrets live only in `.env` (git-ignored, as are all `.env.*` files except `.env.example`). `.env.test` is generated
  locally with random keys by `scripts/ensure-test-env.mjs`.
- **Production start-up guard** (`src/lib/env.ts`, run from `src/instrumentation.ts`): the server refuses to start if
  `SESSION_SECRET`, `CIN_ENC_KEY` or `CIN_HMAC_KEY` is missing, weak or reused, if `APP_URL` is not `https://`, or if
  `DATABASE_URL` is the local development database. Values are never printed.
- Demo accounts (`npm run db:seed`) take their passwords from the local `.env` or get random ones; the seed refuses to run in production.
- **Email:** `SMTP_URL` (with its password) lives only in `.env`; production refuses to start without it. Ticket emails go only to the addresses stored on the ticket (buyer and attendee); a resend can never target a typed-in address. Each email reminds the customer that the QR code is their ticket and must stay private.

## National ID (CIN)
| Requirement | Implementation |
|---|---|
| Encrypted at rest, authenticated | AES-256-GCM per value, random 96-bit IV, auth tag, AAD binding (`src/lib/cin.ts`). Key `CIN_ENC_KEY`, versioned via `cin_key_version`. |
| Keyed digest for lookup/duplicates | HMAC-SHA256 with a separate `CIN_HMAC_KEY` → `cin_hmac` (unique). Lookups and gate checks compare digests and never decrypt. |
| Never in logs, QR codes, emails or public URLs (tested on real ticket emails) | `audit()` strips CIN-like fields; QR = opaque 256-bit token; templates select name/email/ticket fields only. Tested. |
| Masked in UIs, full value restricted | Only `cin_last3` in clear; full reveal is Team Leader-only, needs a reason, logged in append-only `identity_access_logs`. |
| Retention | `npm run retention:purge` crypto-shreds CIN data past `retention_until` (enforced by a CHECK constraint). |
| **No contact takeover** | Public forms can never change the email/phone of an existing identity (`upsertIdentity(..., { trustedContact: false })`). Otherwise anyone knowing a victim's CIN could redirect the victim's ticket emails. Only sellers, who see the ID card, update contacts. Tested. |

## Authentication & sessions
- bcrypt (cost 12) passwords, minimum 12 characters. Unknown emails are compared against a real dummy hash, so response time does not reveal which accounts exist.
- **Server-side sessions** (`sessions` table). The cookie holds only a signed session id (HS256, 12 h). Every request checks the session row and that the user is still active; role and name come from the database, never the cookie. **Sign-out and deactivation revoke access immediately**, including on other devices and for copied cookies. Tested.
- Cookie: `httpOnly`, `SameSite=Strict`, `Secure` and the `__Host-` prefix in production.
- **Brute-force protection:** after 8 failed logins for an email in 15 minutes, that email is locked for the rest of the window. Failures are counted in the append-only audit log under an opaque per-email key (identical for existing and non-existing accounts), so the lock survives restarts and works across instances. An additional per-IP limit applies when the IP is trustworthy.

## Request safety
- **CSRF:** `SameSite=Strict` cookies, plus middleware that refuses mutating API calls whose `Sec-Fetch-Site` is cross-site, whose `Origin` host differs from the host the browser used, or whose body is not JSON (HTML forms from other sites cannot send JSON without a CORS preflight).
- **Body size:** API bodies over 64 KB are rejected before parsing (memory-exhaustion protection).
- **Input validation:** every endpoint validates with Zod (unknown keys stripped, lengths and array sizes capped). Money is integer millimes; prices always come from the database.
- **SQL injection:** Prisma parameterised queries only; raw SQL uses tagged templates (parameterised).
- **Authorization** is re-checked inside every service function (role, event assignment, sales-point membership, ownership). Middleware redirects are a convenience, not the gate.

## Browser hardening
- **Content-Security-Policy with a per-request nonce** (`src/middleware.ts`): only this response's scripts (and what they load) can run, which blocks injected scripts even if an HTML injection bug appeared. Also `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`.
- Headers: HSTS (preload), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (ticket tokens in URLs never leak), restrictive `Permissions-Policy` (camera only for the scanner), COOP/CORP `same-origin`.
- The service worker caches only the static shell, never API responses, tickets or staff pages.

## Rate limiting and the client IP
`X-Forwarded-For` can be forged by any client, so it is ignored unless `TRUST_PROXY_HOPS` says how many proxies
append to it (`src/server/ip.ts`). Behind one HTTPS proxy, set `TRUST_PROXY_HOPS=1`. Public writes are limited to
20/min per trusted IP (one shared bucket of 120/min otherwise), and each purchaser email to 2 pending reservations per edition (anti email-bombing).
The limiter is in memory: use one instance, or move it to Redis before scaling out.

## Financial integrity
- Append-only ledgers via database triggers; no delete paths in the API; cached balances can be rebuilt from the ledger.
- No self-reconciliation (service check + DB CHECK). One sale per ticket (unique index). Capacities enforced by CHECK constraints.
- **Limitation:** the system records what each seller owes but cannot prove the cash was collected. Use handover receipts and daily counts.

## Dependencies
- CI fails on critical runtime vulnerabilities (`npm run audit`); Dependabot opens weekly update PRs; CodeQL scans every push.
- Reviewed and accepted (not reachable by visitors), as of 2026-11-19:
  - `next` → bundled `postcss` advisories: PostCSS only processes this project's own CSS at build time. Fixed upstream in Next 16; upgrade when migrating.
  - `prisma` / `@prisma/config` → `deepmerge-ts` stack exhaustion: CLI config loading of our own files only; not part of the running server.

## Known remaining risks
- **Reservation spam:** an attacker with many real IPs could still fill the free reservation quota with fake names. Team Leaders can cancel; add a CAPTCHA (e.g. Cloudflare Turnstile) if it happens.
- **CIN key rotation** is not automated; plan it before production.
- **Legal:** Tunisian Organic Law No. 2004-63 (INPDP) declaration and a legal review are required before production.

## Before going live
- [ ] Generate production secrets in a vault; never reuse the development `.env`
- [ ] HTTPS reverse proxy, `TRUST_PROXY_HOPS=1`, database backups (the encrypted CIN columns included)
- [ ] Create real Team Leader accounts; never run the seed on the server
- [ ] Cron for `reservations:expire` and `retention:purge`; SMTP configured
- [ ] GitHub: enable secret scanning + push protection, private vulnerability reporting, branch protection on `main`
- [ ] Legal review / INPDP declaration

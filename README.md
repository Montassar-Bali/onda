# ONDA — Cash Ticketing PWA for ONDA at Tropical Bar (spec v2.0)

ONDA is a recurring event at Tropical Bar: each edition has its own theme, date and theme colour.

One Next.js PWA with three interfaces — **Admin** (Team Leader), **Team** (sellers & scanners) and **Customer** (public) — on one PostgreSQL database and one authorization system.

Confirmed business rules (spec v2.0): **cash only**, **TND only** (stored as integer millimes), **national ID (CIN) required** for every ticket holder and reservation attendee, and **unpaid reservations use separate inventory**. There is no payment gateway.

## Quick start (development)

```bash
npm install
cp .env.example .env        # then fill SESSION_SECRET, CIN_ENC_KEY, CIN_HMAC_KEY (openssl rand -base64 32 each)
npm run db:start            # project-local PostgreSQL on localhost:5433 (data in ./.pgdata)
npm run db:migrate          # apply schema + constraint migrations
npm run db:seed             # demo edition, sales point and staff accounts (passwords from SEED_* in .env, or printed once)
npm run dev                 # http://localhost:3000
```

| Interface | URL | Who |
|---|---|---|
| Customer | `/`, `/events/:id`, `/reservations/:code`, `/t/:token` | Public |
| Team | `/team` → sell, activate printed, check-in, reservations, my cash | Team members (and leaders) |
| Admin | `/admin` → events, settings, physical tickets, cash reconciliation, tickets & comps, users, identity lookup, audit | Team Leader |

## Tests

```bash
npm test          # creates .env.test with random keys if missing, migrates the separate tropical_test DB, empties it, runs Vitest
npm run typecheck
```

The suite proves the critical rules: atomic sales with rollback, no overselling under concurrency, single activation of a printed QR under a race, unsold QR denied at the gate, the spec §6 reconciliation example (750 / 700 → 50.000 TND discrepancy), no self-reconciliation, append-only financial history, reservations never touching paid inventory, reservation admission respecting paid-holder priority, exactly-once check-in, and no plaintext CIN in the database, logs or emails.

## Ticket emails

After every sale the **buyer** receives all their tickets by email and each **attendee** receives their own: QR code,
manual entry code, an "open my ticket" link and the PDF ticket attached. Staff see on screen where each email went;
Team Leaders can resend a ticket from *Tickets & comps*.

- Development: without `SMTP_URL`, each email is saved in `.mail-outbox/*.eml` — double-click to open it in Mail.
- Production: set `SMTP_URL` and `MAIL_FROM` (see `.env.example`); the server refuses to start without them.

## Scheduled jobs (cron in production)

```bash
npm run reservations:expire   # every 5–15 minutes: expires reservations and releases quota
npm run retention:purge       # daily: crypto-shreds CIN data past its retention date
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, status dimensions, workflows, and where each v2.0 rule is enforced
- [docs/SECURITY.md](docs/SECURITY.md): every security control, accepted risks and the pre-launch checklist
- [SECURITY.md](SECURITY.md): how to report a vulnerability
- [docs/API.md](docs/API.md): every endpoint

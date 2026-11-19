# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private
"Report a vulnerability" button (Security tab → Advisories), or contact the maintainers privately.
Include steps to reproduce. We aim to acknowledge reports within 72 hours.

## What this project protects

Cash takings, ticket validity and attendees' national ID numbers (CIN). The design and every control
are described in [docs/SECURITY.md](docs/SECURITY.md).

## Running it safely

- Never commit `.env` or `.env.*`; they are git-ignored. Copy `.env.example` and generate every secret
  with `openssl rand -base64 32`. In production the server **refuses to start** with missing, weak or
  reused secrets, an http:// `APP_URL`, or the local development database.
- The demo accounts from `npm run db:seed` are for development only; the seed refuses to run in production.
- Put the app behind HTTPS (a reverse proxy such as Caddy or nginx) and set `TRUST_PROXY_HOPS=1`.

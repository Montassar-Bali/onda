# API reference

All endpoints are under `/api`. JSON in and out, money in integer millimes (TND). Errors: `{ "error": { "code", "message" } }` with HTTP 400/401/403/404/409/429.

Source of truth: `src/server/routes.ts`. Authorization is re-checked inside each service.

Auth: `POST /api/auth/login` `{email, password}` → session cookie · `POST /api/auth/logout`.


## Customer (public)

| Method | Path |
|---|---|
| GET | `/api/public/events` |
| POST | `/api/public/reservations` |
| GET | `/api/public/reservations/:code` |
| POST | `/api/public/reservations/:code/cancel` |
| GET | `/api/public/tickets/:token/pdf` |

## Team (signed in)

| Method | Path |
|---|---|
| POST | `/api/team/sales` |
| GET | `/api/team/physical/preview` |
| POST | `/api/team/physical/activate` |
| POST | `/api/team/physical/return` |
| POST | `/api/team/checkin` |
| POST | `/api/team/reservations/admit` |
| GET | `/api/team/reservations/:code` |
| POST | `/api/team/reservations/convert` |
| POST | `/api/team/reservations/:code/cancel` |
| POST | `/api/team/cash/handovers` |
| POST | `/api/team/cash/handovers/:id/cancel` |
| POST | `/api/team/cash/discrepancies/:id/explain` |

## Admin (Team Leader)

| Method | Path |
|---|---|
| POST | `/api/admin/events` |
| PUT | `/api/admin/events/:id` |
| POST | `/api/admin/events/:id/status` |
| POST | `/api/admin/events/:id/categories` |
| PUT | `/api/admin/events/:id/categories/:cid` |
| PUT | `/api/admin/events/:id/sellers` |
| PUT | `/api/admin/events/:id/reservations` |
| GET | `/api/admin/events/:id/report` |
| POST | `/api/admin/batches` |
| GET | `/api/admin/batches/:id/pdf` |
| POST | `/api/admin/tickets/assign` |
| POST | `/api/admin/tickets/transfer` |
| POST | `/api/admin/tickets/void` |
| POST | `/api/admin/tickets/review-returned` |
| POST | `/api/admin/tickets/:id/reverse` |
| POST | `/api/admin/tickets/:id/revoke` |
| POST | `/api/admin/tickets/:id/reissue` |
| POST | `/api/admin/complimentary` |
| POST | `/api/admin/cash/reconcile` |
| GET | `/api/admin/cash/accounts/:id/verify` |
| POST | `/api/admin/cash/discrepancies/:id/require-explanation` |
| POST | `/api/admin/cash/discrepancies/:id/resolve` |
| POST | `/api/admin/users` |
| PATCH | `/api/admin/users/:id` |
| POST | `/api/admin/sales-points` |
| PUT | `/api/admin/sales-points/:id/members` |
| POST | `/api/admin/identities/lookup` |
| POST | `/api/admin/identities/:id/reveal` |

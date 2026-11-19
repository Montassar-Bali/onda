# Architecture — spec v2.0

```
 Customer UI ─┐
 Team UI ─────┼─► /api/* (src/server/routes.ts) ─► services (src/services/*) ─► PostgreSQL
 Admin UI ────┘        auth gate                      business rules             constraints + triggers
```

Every rule is enforced in **three layers**: the UI (guidance only), the service layer (authorization + business rules inside one DB transaction) and the **database** (CHECK constraints, partial unique indexes, append-only triggers). See `prisma/migrations/*_v2_constraints/migration.sql`.

## Money

All amounts are `Int` millimes (1 TND = 1000). `src/lib/money.ts` parses (`"25.500"` → `25500`, max 3 decimals) and formats (`25500` → `25.500 TND`). There is no floating-point money arithmetic and no other currency.

## Separated ticket concepts (spec §2)

| Concept | Where |
|---|---|
| A. Inventory | `tickets.inventory_status`: AVAILABLE · ASSIGNED · SOLD · VOID · RETURNED |
| B. Issuance | `tickets.kind` (DIGITAL · PHYSICAL · COMPLIMENTARY), `batch_id`, `issued_by_id`, `sold_by_id` |
| C. Payment | `tickets.payment_status`: NOT_COLLECTED · CASH_REPORTED_COLLECTED · CASH_RECONCILED · REVERSED, plus the `cash_transactions` ledger |
| D. Admission | `tickets.admission_status`: NOT_ELIGIBLE · VALID · CHECKED_IN · REVOKED |
| E. Reservations | `reservations`, `reservation_attendees`, `reservation_inventory`: never in `tickets` |
| F. Cash reconciliation | `seller_cash_accounts`, `cash_handovers`, `cash_reconciliations`, `cash_discrepancies` |

DB-level consistency rules:
- `admission_requires_entitlement`: VALID/CHECKED_IN only if SOLD with collected cash (paid) **or** complimentary with an issuer and a reason.
- `unsold_physical_not_eligible`: AVAILABLE/ASSIGNED/RETURNED tickets are always NOT_COLLECTED + NOT_ELIGIBLE.
- `cash_one_sale_per_ticket`: a partial unique index, so a ticket can never be sold twice.
- `batch_size`: 1–200 tickets.
- `capacity_layout`: paid + complimentary ≤ venue capacity; counters can never exceed their limits.
- `no_self_reconciliation`: `reconciled_by_id <> seller_id`.
- Append-only triggers on `cash_transactions`, `cash_reconciliations`, `audit_logs`, `identity_access_logs`, `ticket_inventory_movements`, `physical_ticket_assignments`, `ticket_transfers`, `scan_logs`. Handovers and discrepancies cannot be deleted and their amounts are frozen. A sold ticket's seller, price and sale time are immutable.

## Required modules (spec §9) → tables

`cash_transactions`, `seller_cash_accounts`, `cash_handovers`, `cash_reconciliations`, `cash_discrepancies`, `physical_ticket_batches`, `physical_ticket_assignments`, `ticket_transfers`, `ticket_inventory_movements`, `customer_identity_records`, `identity_access_logs` and `reservation_inventory` all exist with the same names. Supporting tables: `users`, `sales_points`, `sales_point_members`, `events`, `event_sellers`, `ticket_categories`, `tickets`, `reservations`, `reservation_attendees`, `audit_logs`, `scan_logs`, `email_outbox`.

## Workflows

### Digital cash sale (§3): `services/sales.ts › sellDigitalTickets`
In one transaction: verify the seller is assigned to the event and is a member of the sales point → load the official price (the client must echo the price it displayed; a mismatch aborts with `PRICE_CHANGED`) → take the event capacity lock → upsert every holder's identity (CIN encrypted) → enforce the per-identity limit → atomically consume paid inventory with a conditional `UPDATE … WHERE paid_sold_count + n <= paid_ticket_capacity` → create the tickets (SOLD / CASH_REPORTED_COLLECTED / VALID) → append a `cash_transactions` SALE per ticket → increase the seller's `expected_millimes` → write movements and the audit log. The ticket emails go out only after commit. Any failure rolls everything back.

### Physical tickets (§4): `services/physical.ts`, `sales.ts › activatePhysicalTicket`
The Team Leader generates batches (≤ 200), optionally assigned to a seller or sales point. Tickets start NOT_COLLECTED / NOT_ELIGIBLE, so the QR exists but scans as **"UNSOLD TICKET — PAYMENT NOT RECORDED — ENTRY DENIED"**. On activation: `SELECT … FOR UPDATE` on the ticket → check the assignment (own seller, or a member of the assigned sales point) → official price → atomic inventory → conditional status update (`WHERE inventory_status='ASSIGNED' AND payment_status='NOT_COLLECTED'`) → SALE ledger entry. If two sellers race, exactly one succeeds; the unique SALE index is the final guarantee. Transfers, returns (seller → RETURNED for admin review), restock and void are all recorded in `ticket_transfers`, `physical_ticket_assignments` and `ticket_inventory_movements`.

### Complimentary (§2.5)
Team Leader only, with a mandatory reason. Counts against `complimentary_allocation`, which sits inside venue capacity. Price 0, reported separately from revenue.

### Seller cash accountability (§6): `services/cash.ts`
- `expected = Σ SALE − Σ REVERSAL` (the ledger); `reconciled = Σ counted by a Team Leader`; `outstanding = expected − reconciled`.
- A seller **declares** a handover (`cash_handovers`, SUBMITTED). This never changes the balance.
- A Team Leader (never the seller, enforced in the service and by a DB CHECK) records the **counted** cash. If counted ≠ declared, a `DECLARED_VS_COUNTED` discrepancy is created; a final settlement that leaves an outstanding balance creates `FINAL_OUTSTANDING`. Discrepancies can require an explanation from the seller; closing the review **never** erases the liability.
- Tickets move to CASH_RECONCILED in sale order (FIFO) as reconciled cash fully covers them.
- `reconstructAccount()` rebuilds every balance from the append-only ledgers and flags any mismatch with the cached totals (shown on the account history page).
- Reversals (refunds) are Team Leader–authorized negative ledger entries, allowed only for unused, unreconciled tickets.

### Reservations (§1.4, §7): `services/reservations.ts`
Configured per event in `reservation_inventory`: enabled flag, quota of reserved attendee places, max per reservation, open/close window, expiry policy (N hours / at close / at event start, always capped at event start), and whether reservation-based admission is allowed. Creating a reservation touches **only** `reservation_inventory.pending_attendees`. Each attendee's identity is required, and one identity may hold one pending reservation per event. Expiry, cancellation and conversion release the quota. **Conversion** is an explicit seller cash sale: the purchaser's CIN must match, it consumes paid inventory at that moment, and it creates normal paid tickets. Nothing converts automatically.

**Reservation quota interpretation:** the spec's "maximum number of reservations" is implemented as a quota of attendee *places* held by PENDING reservations, which is the safer reading for capacity planning. "Maximum tickets per reservation" caps attendees per reservation. Both are shown in the admin settings.

### Check-in & capacity (§7): `services/checkin.ts`
- Ticket scan: conditional `VALID → CHECKED_IN` plus `UPDATE events SET checked_in_count+1 WHERE checked_in_count < venue_capacity`, in one transaction. Duplicates, unsold, revoked, wrong-event and unknown codes are denied and logged in `scan_logs` (duplicate attempts are reported).
- Unpaid reservation admission (only if the event allows it): the CIN must match an attendee (HMAC compare), and capacity must remain **after reserving room for every outstanding VALID paid/comp entitlement**, so paid holders keep priority. Venue capacity is never exceeded (DB CHECK).

## Reporting (§8): `services/reports.ts`
Four independent sections (paid, physical inventory, reservations, attendance). Reservations are never added to revenue; complimentary tickets show 0 revenue separately.

## Assumptions made without the original v1 spec
- The roles are Team Leader (admin) and Team Member (seller/scanner). Customers do not log in: they reserve with their identity data and receive an opaque reservation code; tickets are delivered by email link `/t/<token>` and as a PDF.
- Sellers must be assigned to an event to sell or scan for it; Team Leaders can do both, but their own cash must be reconciled by *another* Team Leader.
- Times display in `Africa/Tunis`.

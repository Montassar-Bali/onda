-- ════════════════════════════════════════════════════════════════════════════
-- v2.0 business-rule constraints enforced by the database itself.
-- These hold even if application code is bypassed or buggy.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Money: integer millimes, never negative where it cannot be ──
ALTER TABLE ticket_categories ADD CONSTRAINT price_non_negative CHECK (price_millimes >= 0);
ALTER TABLE cash_handovers   ADD CONSTRAINT declared_positive CHECK (declared_millimes > 0);
ALTER TABLE cash_reconciliations ADD CONSTRAINT counted_non_negative CHECK (counted_millimes >= 0);
ALTER TABLE cash_transactions ADD CONSTRAINT cash_sign CHECK (
  (type = 'SALE' AND amount_millimes > 0 AND reverses_id IS NULL AND authorized_by_id IS NULL) OR
  (type = 'REVERSAL' AND amount_millimes < 0 AND reverses_id IS NOT NULL AND authorized_by_id IS NOT NULL)
);
-- One SALE per ticket — a ticket can never be sold/activated twice.
CREATE UNIQUE INDEX cash_one_sale_per_ticket ON cash_transactions (ticket_id) WHERE type = 'SALE';

-- ── Events: capacities ──
ALTER TABLE events ADD CONSTRAINT capacity_layout CHECK (
  venue_capacity > 0 AND paid_ticket_capacity >= 0 AND complimentary_allocation >= 0
  AND paid_ticket_capacity + complimentary_allocation <= venue_capacity
  AND max_tickets_per_identity >= 1
);
ALTER TABLE events ADD CONSTRAINT counters_within_limits CHECK (
  paid_sold_count BETWEEN 0 AND paid_ticket_capacity
  AND comp_issued_count BETWEEN 0 AND complimentary_allocation
  AND checked_in_count BETWEEN 0 AND venue_capacity
  AND reservation_admit_count BETWEEN 0 AND checked_in_count
);
ALTER TABLE events ADD CONSTRAINT event_dates CHECK (ends_at > starts_at);
ALTER TABLE ticket_categories ADD CONSTRAINT category_counter CHECK (
  sold_count >= 0 AND (capacity IS NULL OR sold_count <= capacity)
);

-- ── Physical batches: at most 200 tickets ──
ALTER TABLE physical_ticket_batches ADD CONSTRAINT batch_size CHECK (quantity BETWEEN 1 AND 200);

-- ── Tickets: the separated status dimensions must be mutually consistent ──
ALTER TABLE tickets ADD CONSTRAINT admission_requires_entitlement CHECK (
  admission_status NOT IN ('VALID', 'CHECKED_IN') OR (
    holder_identity_id IS NOT NULL AND inventory_status = 'SOLD' AND (
      (kind IN ('DIGITAL', 'PHYSICAL') AND payment_status IN ('CASH_REPORTED_COLLECTED', 'CASH_RECONCILED')
        AND sold_by_id IS NOT NULL AND price_millimes > 0)
      OR
      (kind = 'COMPLIMENTARY' AND issued_by_id IS NOT NULL AND complimentary_reason IS NOT NULL
        AND payment_status = 'NOT_COLLECTED')
    )
  )
);
ALTER TABLE tickets ADD CONSTRAINT sold_has_payment CHECK (
  inventory_status <> 'SOLD' OR kind = 'COMPLIMENTARY'
  OR payment_status IN ('CASH_REPORTED_COLLECTED', 'CASH_RECONCILED')
);
ALTER TABLE tickets ADD CONSTRAINT unsold_physical_not_eligible CHECK (
  inventory_status NOT IN ('AVAILABLE', 'ASSIGNED', 'RETURNED')
  OR (admission_status = 'NOT_ELIGIBLE' AND payment_status = 'NOT_COLLECTED')
);
ALTER TABLE tickets ADD CONSTRAINT physical_has_batch CHECK ((kind = 'PHYSICAL') = (batch_id IS NOT NULL));
ALTER TABLE tickets ADD CONSTRAINT checked_in_has_time CHECK (
  (admission_status = 'CHECKED_IN') = (checked_in_at IS NOT NULL)
);

-- ── Cash reconciliation: nobody reconciles their own cash ──
ALTER TABLE cash_reconciliations ADD CONSTRAINT no_self_reconciliation CHECK (reconciled_by_id <> seller_id);

-- ── Reservations: separate counters ──
ALTER TABLE reservation_inventory ADD CONSTRAINT reservation_quota CHECK (
  max_reserved_attendees >= 0 AND max_tickets_per_reservation >= 1
  AND pending_attendees BETWEEN 0 AND max_reserved_attendees
  AND closes_at > opens_at
  AND (expiry_policy <> 'HOURS_AFTER_CREATION' OR expiry_hours >= 1)
);

-- ── Identity: CIN either fully present (encrypted) or fully purged ──
ALTER TABLE customer_identity_records ADD CONSTRAINT cin_encrypted_or_purged CHECK (
  (purged_at IS NULL AND cin_ciphertext IS NOT NULL AND cin_iv IS NOT NULL AND cin_tag IS NOT NULL AND cin_hmac IS NOT NULL)
  OR (purged_at IS NOT NULL AND cin_ciphertext IS NULL AND cin_iv IS NULL AND cin_tag IS NULL AND cin_hmac IS NULL)
);

-- ── Append-only financial & audit history ──
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cash_transactions', 'cash_reconciliations', 'audit_logs', 'identity_access_logs',
    'ticket_inventory_movements', 'physical_ticket_assignments', 'ticket_transfers', 'scan_logs'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_mutation()', t, t);
  END LOOP;
END $$;

-- Handovers & discrepancies may change status but never be deleted, and amounts are immutable.
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rows in % cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cash_handovers_no_delete BEFORE DELETE ON cash_handovers FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER cash_discrepancies_no_delete BEFORE DELETE ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER tickets_no_delete BEFORE DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION forbid_delete();
CREATE TRIGGER seller_cash_accounts_no_delete BEFORE DELETE ON seller_cash_accounts FOR EACH ROW EXECUTE FUNCTION forbid_delete();

CREATE OR REPLACE FUNCTION freeze_amounts() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'cash_handovers' AND NEW.declared_millimes <> OLD.declared_millimes THEN
    RAISE EXCEPTION 'declared_millimes is immutable';
  END IF;
  IF TG_TABLE_NAME = 'cash_discrepancies' AND NEW.amount_millimes <> OLD.amount_millimes THEN
    RAISE EXCEPTION 'amount_millimes is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cash_handovers_freeze BEFORE UPDATE ON cash_handovers FOR EACH ROW EXECUTE FUNCTION freeze_amounts();
CREATE TRIGGER cash_discrepancies_freeze BEFORE UPDATE ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION freeze_amounts();

-- A sold ticket's price and seller can never be rewritten.
CREATE OR REPLACE FUNCTION freeze_sale() RETURNS trigger AS $$
BEGIN
  IF OLD.sold_by_id IS NOT NULL AND (NEW.sold_by_id IS DISTINCT FROM OLD.sold_by_id
      OR NEW.price_millimes IS DISTINCT FROM OLD.price_millimes OR NEW.sold_at IS DISTINCT FROM OLD.sold_at) THEN
    RAISE EXCEPTION 'Sale details of ticket % are immutable', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tickets_freeze_sale BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION freeze_sale();

-- Seller account cached totals must stay consistent with the ledger.
ALTER TABLE seller_cash_accounts ADD CONSTRAINT reconciled_non_negative CHECK (reconciled_millimes >= 0);

-- Split amount-freezing trigger into per-table functions (a shared function cannot
-- reference columns that only exist on one of the tables).
DROP TRIGGER IF EXISTS cash_handovers_freeze ON cash_handovers;
DROP TRIGGER IF EXISTS cash_discrepancies_freeze ON cash_discrepancies;
DROP FUNCTION IF EXISTS freeze_amounts();

CREATE OR REPLACE FUNCTION freeze_handover_amount() RETURNS trigger AS $$
BEGIN
  IF NEW.declared_millimes <> OLD.declared_millimes OR NEW.seller_id <> OLD.seller_id OR NEW.account_id <> OLD.account_id THEN
    RAISE EXCEPTION 'cash_handovers amounts and ownership are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION freeze_discrepancy_amount() RETURNS trigger AS $$
BEGIN
  IF NEW.amount_millimes <> OLD.amount_millimes OR NEW.account_id <> OLD.account_id OR NEW.reconciliation_id <> OLD.reconciliation_id THEN
    RAISE EXCEPTION 'cash_discrepancies amounts are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_handovers_freeze BEFORE UPDATE ON cash_handovers FOR EACH ROW EXECUTE FUNCTION freeze_handover_amount();
CREATE TRIGGER cash_discrepancies_freeze BEFORE UPDATE ON cash_discrepancies FOR EACH ROW EXECUTE FUNCTION freeze_discrepancy_amount();

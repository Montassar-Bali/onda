-- Event theme / tagline printed on tickets.
ALTER TABLE "events" ADD COLUMN "theme" TEXT;

-- Manual entry code for every ticket (fallback when a QR code cannot be scanned).
ALTER TABLE "tickets" ADD COLUMN "manual_code" TEXT;

-- Backfill existing tickets with strong random codes: 12 chars from a 32-char unambiguous alphabet
-- (256 % 32 = 0, so no modulo bias). gen_random_uuid() uses PostgreSQL's strong random source.
CREATE FUNCTION tmp_manual_code() RETURNS text AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  out text := '';
BEGIN
  FOR i IN 0..11 LOOP
    out := out || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  END LOOP;
  RETURN out;
END;
$$ LANGUAGE plpgsql VOLATILE;

UPDATE "tickets" SET "manual_code" = tmp_manual_code() WHERE "manual_code" IS NULL;
DROP FUNCTION tmp_manual_code();

ALTER TABLE "tickets" ALTER COLUMN "manual_code" SET NOT NULL;
CREATE UNIQUE INDEX "tickets_manual_code_key" ON "tickets"("manual_code");
ALTER TABLE "tickets" ADD CONSTRAINT manual_code_format CHECK ("manual_code" ~ '^[A-HJ-NP-Z2-9]{12}$');

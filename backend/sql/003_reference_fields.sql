-- Apply reference-field additions to databases initialized before 001_init.sql was extended.
BEGIN;

ALTER TABLE debtors
  ALTER COLUMN updated_at DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS circuit text NOT NULL DEFAULT 'TODO: VALIDAR CON SEPSA',
  ADD COLUMN IF NOT EXISTS customer_ci text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS tariff text NOT NULL DEFAULT 'TODO: VALIDAR CON SEPSA',
  ADD COLUMN IF NOT EXISTS supply_status text NOT NULL DEFAULT 'TODO: VALIDAR CON SEPSA',
  ADD COLUMN IF NOT EXISTS enabling_title text,
  ADD COLUMN IF NOT EXISTS route_order integer,
  ADD COLUMN IF NOT EXISTS cadastral_latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS cadastral_longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS meter_brand text,
  ADD COLUMN IF NOT EXISTS meter_index text,
  ADD COLUMN IF NOT EXISTS meter_multiplier numeric(12,4),
  ADD COLUMN IF NOT EXISTS claims boolean,
  ADD COLUMN IF NOT EXISTS payment_plan boolean,
  ADD COLUMN IF NOT EXISTS suspension_date timestamptz,
  ADD COLUMN IF NOT EXISTS reconnection_manual boolean,
  ADD COLUMN IF NOT EXISTS reconnection_date timestamptz,
  ADD COLUMN IF NOT EXISTS reconnection_technician text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cuc text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_cuc_unique ON orders(cuc) WHERE cuc IS NOT NULL;

COMMIT;

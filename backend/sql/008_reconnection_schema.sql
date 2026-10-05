-- PILOT_PROVISIONAL only. Additive schema support for RECONNECTION.
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('GENERADO', 'EJECUTADO', 'ANULADO', 'RECONEXIÓN'));

ALTER TABLE sync_operations DROP CONSTRAINT IF EXISTS sync_operations_action_check;
ALTER TABLE sync_operations
  ADD CONSTRAINT sync_operations_action_check
  CHECK (action IN ('CUT', 'VISIT', 'RECONNECTION'));

ALTER TABLE cut_authorizations
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'CUT';
ALTER TABLE cut_authorizations
  ADD COLUMN IF NOT EXISTS technician_name_snapshot text;
ALTER TABLE cut_authorizations DROP CONSTRAINT IF EXISTS cut_authorizations_action_check;
ALTER TABLE cut_authorizations
  ADD CONSTRAINT cut_authorizations_action_check
  CHECK (action IN ('CUT', 'RECONNECTION'));

CREATE UNIQUE INDEX IF NOT EXISTS cut_authorizations_reconnection_active_order_idx
  ON cut_authorizations(order_id)
  WHERE action = 'RECONNECTION' AND status IN ('RESERVED', 'CONSUMED');

CREATE INDEX IF NOT EXISTS sync_operations_order_action_status_idx
  ON sync_operations(order_id, action, status);

COMMIT;

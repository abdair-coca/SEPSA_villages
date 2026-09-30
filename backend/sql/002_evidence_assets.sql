-- PILOT_PROVISIONAL only. Evidence storage and retention contract remains TODO: VALIDAR CON SEPSA.
BEGIN;

CREATE TABLE IF NOT EXISTS evidence_assets (
  evidence_id text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(order_id),
  operation_id text NOT NULL,
  technician_id uuid NOT NULL REFERENCES users(user_id),
  device_id text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  content_hash char(64) NOT NULL,
  content bytea NOT NULL,
  status text NOT NULL CHECK (status = 'verified'),
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_assets_operation_idx ON evidence_assets(operation_id, order_id, technician_id, device_id);

COMMIT;

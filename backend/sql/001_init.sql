-- PILOT_PROVISIONAL only. Not official SEPSA schema or integration contract.
BEGIN;

CREATE TABLE IF NOT EXISTS users (
  user_id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'TECHNICIAN')),
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(user_id),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_active_token_idx ON sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS debtors (
  debtor_id text PRIMARY KEY,
  account_id text NOT NULL UNIQUE,
  supply_id text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  address text NOT NULL,
  reference_text text NOT NULL DEFAULT '',
  meter_id text NOT NULL,
  area text NOT NULL,
  locality text NOT NULL,
  route text NOT NULL,
  debt_cents integer NOT NULL CHECK (debt_cents >= 0),
  months_pending integer NOT NULL CHECK (months_pending >= 0),
  kardex jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL')
);
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS circuit text NOT NULL DEFAULT '';
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS customer_ci text;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS tariff text NOT NULL DEFAULT '';
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS supply_status text NOT NULL DEFAULT '';
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS enabling_title text;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS route_order integer;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS cadastral_latitude numeric;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS cadastral_longitude numeric;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS meter_brand text;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS meter_index text;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS meter_multiplier integer;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS claims boolean;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS payment_plan boolean;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS suspension_date timestamptz;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS reconnection_manual boolean;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS reconnection_date timestamptz;
ALTER TABLE debtors ADD COLUMN IF NOT EXISTS reconnection_technician text;

CREATE TABLE IF NOT EXISTS orders (
  order_id uuid PRIMARY KEY,
  cuc text UNIQUE,
  debtor_id text NOT NULL REFERENCES debtors(debtor_id),
  purpose text NOT NULL CHECK (purpose = 'CUT'),
  status text NOT NULL CHECK (status IN ('GENERADO', 'EJECUTADO', 'ANULADO')),
  physical_status text NOT NULL CHECK (physical_status IN ('NONE', 'CLAIMED', 'CONFIRMED', 'PHYSICAL_UNKNOWN')),
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(user_id),
  assigned_technician_id uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  CHECK (assigned_technician_id IS NULL OR status <> 'ANULADO')
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cuc text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_cuc_idx ON orders(cuc) WHERE cuc IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_debtor_purpose_idx ON orders(debtor_id, purpose) WHERE status = 'GENERADO';
CREATE INDEX IF NOT EXISTS orders_technician_idx ON orders(assigned_technician_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS order_assignments (
  assignment_id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(order_id),
  technician_id uuid NOT NULL REFERENCES users(user_id),
  from_technician_id uuid REFERENCES users(user_id),
  assigned_by uuid NOT NULL REFERENCES users(user_id),
  version integer NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL')
);

CREATE TABLE IF NOT EXISTS command_operations (
  operation_id text PRIMARY KEY,
  operation_type text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(user_id),
  request_hash char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'completed')),
  response jsonb,
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed' AND response IS NOT NULL) OR status = 'pending')
);

CREATE TABLE IF NOT EXISTS cut_authorizations (
  authorization_id uuid PRIMARY KEY,
  operation_id text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(order_id),
  technician_id uuid NOT NULL REFERENCES users(user_id),
  device_id text NOT NULL,
  order_version integer NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('RESERVED', 'CONSUMED', 'EXPIRED', 'REJECTED')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_operation_id text,
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cut_authorizations_binding_idx ON cut_authorizations(order_id, technician_id, device_id, status);

CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id text PRIMARY KEY,
  technician_id uuid NOT NULL REFERENCES users(user_id),
  device_id text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(order_id),
  action text NOT NULL CHECK (action IN ('CUT', 'VISIT')),
  payload jsonb NOT NULL,
  payload_hash char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'acknowledged', 'conflict')),
  conflict_reason text,
  acknowledged_at timestamptz,
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(user_id),
  actor_role text CHECK (actor_role IN ('ADMIN', 'TECHNICIAN')),
  action text NOT NULL,
  entity_id text,
  order_id uuid REFERENCES orders(order_id),
  operation_id text,
  result text NOT NULL CHECK (result IN ('accepted', 'rejected')),
  reason text,
  device_id text,
  transition jsonb,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'PILOT_PROVISIONAL' CHECK (source = 'PILOT_PROVISIONAL')
);
CREATE INDEX IF NOT EXISTS audit_order_time_idx ON audit_events(order_id, occurred_at);

COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS payment_observations (
  observation_id uuid PRIMARY KEY,
  operation_id text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(order_id),
  account_id text NOT NULL,
  supply_id text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(user_id),
  actor_role text NOT NULL CHECK (actor_role IN ('ADMIN', 'TECHNICIAN')),
  device_id text NOT NULL,
  source text NOT NULL CHECK (source = 'PILOT_PROVISIONAL'),
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_observations_account_idx ON payment_observations(account_id);
CREATE INDEX IF NOT EXISTS payment_observations_supply_idx ON payment_observations(supply_id);

CREATE OR REPLACE FUNCTION reject_payment_observation_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment observations are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_observations_append_only ON payment_observations;
CREATE TRIGGER payment_observations_append_only
  BEFORE UPDATE OR DELETE ON payment_observations
  FOR EACH ROW EXECUTE FUNCTION reject_payment_observation_mutation();

COMMIT;

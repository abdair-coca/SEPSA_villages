-- PILOT_PROVISIONAL only. Durable package versions for technician/device scopes.
BEGIN;

CREATE TABLE IF NOT EXISTS work_package_versions (
  technician_id uuid NOT NULL REFERENCES users(user_id),
  device_id text NOT NULL,
  last_version bigint NOT NULL CHECK (last_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (technician_id, device_id)
);

COMMIT;

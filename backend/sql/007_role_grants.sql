-- PILOT_PROVISIONAL: preserve each account's existing role; additional grants are explicit.
BEGIN;

CREATE TABLE IF NOT EXISTS user_role_grants (
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ADMIN', 'TECHNICIAN')),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_role_grants (user_id, role)
SELECT user_id, role FROM users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION grant_initial_user_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_role_grants (user_id, role) VALUES (NEW.user_id, NEW.role);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_initial_role_grant ON users;
CREATE TRIGGER users_initial_role_grant AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION grant_initial_user_role();

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_role text CHECK (active_role IN ('ADMIN', 'TECHNICIAN'));
UPDATE sessions s SET active_role = u.role FROM users u
WHERE u.user_id = s.user_id AND s.active_role IS NULL;
ALTER TABLE sessions ALTER COLUMN active_role SET NOT NULL;

COMMIT;

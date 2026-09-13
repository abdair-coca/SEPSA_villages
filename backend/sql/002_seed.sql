-- PILOT_PROVISIONAL demo data. Passwords are represented only by scrypt hashes.
BEGIN;

INSERT INTO users(user_id, username, display_name, role, password_hash, source)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'PILOT_PROVISIONAL_ADMIN', 'PILOT_PROVISIONAL Administrator', 'ADMIN', 'scrypt$16384$8$1$Wppti67ZkIduet4RWE3_7Q$FTDgGJgIDyXtOiGrifrS-G0RL2aPevmRkytI3gn3pQ1DQiFDky7ozqPPmnavJmoRoKsi-NGEkPHnyLvOmRw-0Q', 'PILOT_PROVISIONAL'),
  ('10000000-0000-4000-8000-000000000002', 'PILOT_PROVISIONAL_TECHNICIAN', 'PILOT_PROVISIONAL Field Technician', 'TECHNICIAN', 'scrypt$16384$8$1$SSjxDFRffkXKIkJoKai49w$rA2CoZpvMvKrIWVy7XvBZSDtkGGky4pqiSwcfMwz6Qg56Uk3G9tfbSUAcwGMWPPI5gmIK_BksUaWWPMcl88eLQ', 'PILOT_PROVISIONAL')
ON CONFLICT (username) DO NOTHING;

INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id, area, locality, route, debt_cents, months_pending, kardex, context, updated_at, source)
VALUES
  ('PILOT_PROVISIONAL-DEBTOR-001', 'PILOT_PROVISIONAL-ACCOUNT-001', 'PILOT_PROVISIONAL-SUPPLY-001', 'PILOT_PROVISIONAL Demo Customer', 'PILOT_PROVISIONAL Demo Address 001', 'PILOT_PROVISIONAL Demo Reference', 'PILOT_PROVISIONAL-METER-001', 'PILOT_PROVISIONAL Area', 'PILOT_PROVISIONAL Locality', 'PILOT_PROVISIONAL Route 001', 24050, 2,
   '[{"entry_id":"PILOT_PROVISIONAL-KARDEX-001","period":"PILOT_PROVISIONAL-2026-01","amount_cents":12025,"status":"PENDING"},{"entry_id":"PILOT_PROVISIONAL-KARDEX-002","period":"PILOT_PROVISIONAL-2026-02","amount_cents":12025,"status":"PENDING"}]'::jsonb,
   '{"source":"PILOT_PROVISIONAL","meaning_status":"TODO: VALIDAR CON SEPSA"}'::jsonb, now(), 'PILOT_PROVISIONAL'),
  ('PILOT_PROVISIONAL-DEBTOR-002', 'PILOT_PROVISIONAL-ACCOUNT-002', 'PILOT_PROVISIONAL-SUPPLY-002', 'PILOT_PROVISIONAL Second Customer', 'PILOT_PROVISIONAL Demo Address 002', 'PILOT_PROVISIONAL Demo Reference', 'PILOT_PROVISIONAL-METER-002', 'PILOT_PROVISIONAL Area', 'PILOT_PROVISIONAL Locality', 'PILOT_PROVISIONAL Route 002', 9050, 1,
   '[{"entry_id":"PILOT_PROVISIONAL-KARDEX-003","period":"PILOT_PROVISIONAL-2026-02","amount_cents":9050,"status":"PENDING"}]'::jsonb,
   '{"source":"PILOT_PROVISIONAL","meaning_status":"TODO: VALIDAR CON SEPSA"}'::jsonb, now(), 'PILOT_PROVISIONAL')
ON CONFLICT (debtor_id) DO NOTHING;

COMMIT;

-- PILOT_PROVISIONAL demo data. Passwords are represented only by scrypt hashes.
BEGIN;

INSERT INTO users(user_id, username, display_name, role, password_hash, source)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'PILOT_PROVISIONAL_ADMIN', 'Administración de operaciones', 'ADMIN', 'scrypt$16384$8$1$Wppti67ZkIduet4RWE3_7Q$FTDgGJgIDyXtOiGrifrS-G0RL2aPevmRkytI3gn3pQ1DQiFDky7ozqPPmnavJmoRoKsi-NGEkPHnyLvOmRw-0Q', 'PILOT_PROVISIONAL'),
  ('10000000-0000-4000-8000-000000000002', 'PILOT_PROVISIONAL_TECHNICIAN', 'Técnico de campo', 'TECHNICIAN', 'scrypt$16384$8$1$SSjxDFRffkXKIkJoKai49w$rA2CoZpvMvKrIWVy7XvBZSDtkGGky4pqiSwcfMwz6Qg56Uk3G9tfbSUAcwGMWPPI5gmIK_BksUaWWPMcl88eLQ', 'PILOT_PROVISIONAL')
ON CONFLICT (username) DO NOTHING;

INSERT INTO debtors(debtor_id, account_id, supply_id, customer_name, address, reference_text, meter_id, area, locality, route, debt_cents, months_pending, kardex, context, updated_at, source, circuit, customer_ci, contact_phone, tariff, supply_status, enabling_title, route_order, cadastral_latitude, cadastral_longitude, meter_brand, meter_index, meter_multiplier, claims, payment_plan, suspension_date, reconnection_manual, reconnection_date, reconnection_technician)
VALUES
   ('PILOT_PROVISIONAL-DEBTOR-001', '306040', 'SUM-306040', 'María Flores', 'Av. Petrolera 145, Villa Esperanza', 'Frente a unidad educativa', '240907792', 'B', '002 - MOJOTORILLO', '002', 6682, 3,
   '[{"entry_id":"invoice-001-06","period":"2026-06","amount_cents":2194,"status":"PENDING","billing_date":"2026-06-27","invoice_origin":"FA_FACTURAS","days_late":63},{"entry_id":"invoice-001-07","period":"2026-07","amount_cents":2244,"status":"PENDING","billing_date":"2026-07-27","invoice_origin":"FA_FACTURAS","days_late":31},{"entry_id":"invoice-001-08","period":"2026-08","amount_cents":2244,"status":"PENDING","billing_date":"2026-08-27","invoice_origin":"FA_FACTURAS","days_late":2}]'::jsonb,
   '{"meaning_status":"TODO: VALIDAR CON SEPSA"}'::jsonb, now(), 'PILOT_PROVISIONAL', 'D-1182', null, null, 'RS', 'A', 'R', 129, -19.589366, -65.259119, 'WASION', '240907792', 1, false, false, '2026-08-27T00:00:00Z', false, null, null),
  ('PILOT_PROVISIONAL-DEBTOR-002', '306043', 'SUM-306043', 'José Quispe', 'Calle Los Álamos 22, San Pedro', 'A dos cuadras del mercado', '240907795', 'B', '002 - MOJOTORILLO', '002', 4520, 2,
   '[{"entry_id":"invoice-002-07","period":"2026-07","amount_cents":2260,"status":"PENDING","billing_date":"2026-07-27","invoice_origin":"FA_FACTURAS","days_late":31},{"entry_id":"invoice-002-08","period":"2026-08","amount_cents":2260,"status":"PENDING","billing_date":"2026-08-27","invoice_origin":"FA_FACTURAS","days_late":2}]'::jsonb,
   '{"meaning_status":"TODO: VALIDAR CON SEPSA"}'::jsonb, now(), 'PILOT_PROVISIONAL', 'D-1182', null, null, 'RS', 'A', 'R', 132, -19.588912, -65.258647, 'WASION', '240907795', 1, false, false, '2026-08-27T00:00:00Z', false, null, null)
ON CONFLICT (debtor_id) DO NOTHING;

COMMIT;

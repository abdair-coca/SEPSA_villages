-- 002_seed.sql — Usuarios definitivos PRUEBA con Excel 30_03_2026. Sin deudores de prueba (viven en 005).
-- Password inicial 'password123' SOLO entorno local. Se guardan solo hashes scrypt. Rotar antes de compartir.
BEGIN;

INSERT INTO users(user_id, username, display_name, role, password_hash, source)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'admin.sepsa', 'Administración SEPSA', 'ADMIN', 'scrypt$16384$8$1$DGPitTZ--gEW7HtAcRpHdg$coTqCTgT-b8lAaNmr53P6w2clR4WDBcACmGWjCN6FpR0fT1FQ1oMosbxIkdtkNu3eTtMn_waaRZsR35nyZvFLA', 'PILOT_PROVISIONAL'),
  ('20000000-0000-4000-8000-000000000002', 'jhonny.moya', 'Jhonny Moya', 'TECHNICIAN', 'scrypt$16384$8$1$eSvTWcCoo1tGQ4Ewzs0GGQ$iFYCwij3ZB97hTZHjqR1QgyRfDdD5sE69Wawq802u5rs5rBa-a76zg9vrzM_K_QQH5Q-5UAJy8boVYGtBrVZyA', 'PILOT_PROVISIONAL'),
  ('20000000-0000-4000-8000-000000000003', 'tecnico.sepsa02', 'Alex Fernández (PRUEBA)', 'TECHNICIAN', 'scrypt$16384$8$1$13W2Bpqs0fyyjQn98oJfcA$ATGqtYFzzd0YZT_lDNe_TMuxJDXo6oXh4Seudsrm4gkE_Dz_ssyW-ZwprSZwKlTrMZ5BJ3hvqSu8G32VW7Uc7Q', 'PILOT_PROVISIONAL'),
  ('20000000-0000-4000-8000-000000000004', 'tecnico.sepsa03', 'Paola Ríos (PRUEBA)', 'TECHNICIAN', 'scrypt$16384$8$1$j9a6i84UWOe0KpA_ZCR-wQ$VnEB-9zQUUEKcD0Hsgg-tlrUghXx-NxF90WagF093ehyQ1BuHSUMTbj7Xg56JCctmIozTdYW0sIRZMXEcEMUVw', 'PILOT_PROVISIONAL'),
  ('20000000-0000-4000-8000-000000000005', 'tecnico.sepsa04', 'Cristian Soria (PRUEBA)', 'TECHNICIAN', 'scrypt$16384$8$1$gA43bLJzon0U0XbdTZ5kYA$x5miR7DuECdHauHP7osHG3ALoeOz0F76rkk6PmarMQmCZmKfrlFpngRFBiQ6IIXCFeO7TmYhTBs1owuI3DnCEA', 'PILOT_PROVISIONAL'),
  ('20000000-0000-4000-8000-000000000006', 'tecnico.sepsa05', 'Daniela Paredes (PRUEBA)', 'TECHNICIAN', 'scrypt$16384$8$1$s0BRKgGISLeAEDZ8WyUW6w$ttsyiGpiyLdTc_cOGi2dUtpbTjjlR8T742Vnj_uBhHkAw-zEhcY5rCP5K6QDn0CVbxqvjSM9g2rn0hQQw6ieMQ', 'PILOT_PROVISIONAL'),
  ('20000000-0000-4000-8000-000000000007', 'tecnico.sepsa06', 'Marco Aguilar (PRUEBA)', 'TECHNICIAN', 'scrypt$16384$8$1$Qcb7WFUCxTinw8Pmp2JmZQ$gucpyTVNloZKu094M9jWQ5yNSfD9dPrbJTS39QQ2czP9efxSKpe9HQtbz9t_t3tI45-vZSURR3g8BdnUcimF_w', 'PILOT_PROVISIONAL')
ON CONFLICT (username) DO UPDATE SET user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash;

COMMIT;

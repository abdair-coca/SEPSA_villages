# Pendientes para SEPSA

Fuente: marcadores `TODO: VALIDAR CON SEPSA` en los documentos activos de `docs/` (excluido `docs/archive/`), al 2026-10-12, y pendientes sin marcador de `docs/DECISIONS.md`, `docs/DOMAIN.md` y `docs/ARCHITECTURE.md` (P-04, P-11, P-20 a P-22). Cada entrada apunta a la línea de origen.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Ninguna entrada es una regla oficial: son preguntas que SEPSA debe responder.

Las 17 ocurrencias activas del marcador tienen entrada. Hay cinco pendientes sin marcador: P-04, P-11, P-20, P-21 y P-22. El marcador de P-04 estaba en la decisión D017; D022 lo reemplazó. Si una fuente cambia o se resuelve un pendiente, se actualiza esta lista en la misma tarea.

## Reglas de corte y reconexión

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-01 | Reglas de elegibilidad para corte: umbral de facturas o mora, exclusión de intereses, bloqueo por CI/NIT, protección por reclamos y cargos o prioridad de reconexión. El código no las aplica como autoridad general, pero la carga de datos de prueba y el script de importación codifican un umbral de 3 meses para crear órdenes (`backend/migrations/20260923-load-excel-20260922.mjs:113` y `backend/scripts/import-debtors-xlsx.py:123`). | `docs/RULES.md:48` | 01, 02, 05, 07, 09, 10, 13 |
| P-02 | Umbrales y semántica definitiva de la captura de corte (lectura final, GPS, excepciones con motivo). | `docs/DOMAIN.md:54` | 01, 13 |
| P-03 | Política de conciliación oficial de operaciones de corte y reposición. | `docs/features/synchronization.md:63` | 01, 07 |
| P-04 | Política para resolver las autorizaciones de corte y las habilitaciones de reconexión cuya consulta no es concluyente (por ejemplo `ENABLEMENT_LOOKUP_UNKNOWN`). Las que el servidor demuestra no usadas (`expired`, `rejected`, `not_found`) las resuelve el técnico según D022 y no requieren política. **Sin marcador en el texto.** | `docs/DECISIONS.md` (D017, D022) | 01, 02, 07 |

## Registro SC08

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-05 | Equivalencias entre los campos SC08 y el modelo operativo, y los puntos no confirmados. | `docs/DOMAIN.md:3` | 02, 04, 05 |
| P-06 | `NIV_CALIDAD`: el caso exacto de 10.000 usuarios en la localidad. | `docs/DOMAIN.md:78` | 01, 02 |
| P-07 | `DEMORA`: formato oficial y longitud máxima (el piloto limita a 1.000 caracteres). | `docs/DOMAIN.md:81` | 01, 02 |
| P-08 | `ENER_PROM`: periodo de cálculo frente a frecuencia de actualización. | `docs/DOMAIN.md:84` | 02 |
| P-09 | `POT_FACT` e `IMP_REDUC`: significado y fuente. | `docs/DOMAIN.md:85` | 01, 02 |
| P-20 | `NRO_CORREL`: lo asigna SEPSA; falta definir cómo lo recibirá la aplicación. **Sin marcador en el texto.** | `docs/DOMAIN.md:77` | 02 |
| P-21 | Fuente autorizada de la fecha y hora de pago (`FECHA_PAGO`, `HORA_PAGO`), necesaria para `TIEMPO`. El procesamiento de pagos queda fuera del alcance. **Sin marcador en el texto.** | `docs/DOMAIN.md:80` y `docs/DOMAIN.md:87` | 02 |
| P-22 | Formato y destino de salida SC08 (archivo o API). **Sin marcador en el texto.** | `docs/DOMAIN.md:89` | 02 |

## Arquitectura, operación y datos

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-10 | API oficial, límites y retención de los blobs de evidencia en IndexedDB y en el backend. | `docs/ARCHITECTURE.md:141` | 03 |
| P-11 | Proveedor de métricas y alertas, umbrales, topología, TLS, rotación de secretos, rate limit distribuido y backup/restore. **Sin marcador en el texto**: `ARCHITECTURE.md:65` dice que "deben definirse para despliegue". Se incluye porque la entrega debe cubrirlo. | `docs/ARCHITECTURE.md:65` | 01, 03, 07, 08, 12 |
| P-12 | Límites de sesión por dispositivo, identidad de dispositivo y contrato de revocación. | `docs/ARCHITECTURE.md:65` | 01, 03, 12 |
| P-13 | Revocación de sesión por dispositivo (el esquema no liga la sesión a `device_id`). | `docs/api/pilot-contract.md:32` | 01, 03, 12, 13 |
| P-14 | Almacenamiento oficial de evidencia, MIME, tamaño, retención y política de excepciones. | `docs/api/pilot-contract.md:38` | 03, 13 |
| P-15 | Retención y contrato oficial de fotos, límites de tamaño y MIME, y política de excepciones. | `docs/features/cuts.md:54` | 13 |
| P-16 | Umbrales de validación de lecturas, políticas de privacidad y retención. | `docs/features/readings.md:24` | 01 |
| P-17 | Proveedor cloud, topología, TLS, rotación de credenciales, retención y objetivos de recuperación (RPO y RTO). | `docs/operations/pilot-runbook.md:3` | 07, 08, 12, 13 |
| P-18 | Retención oficial de la evidencia fotográfica almacenada en base de datos. | `docs/operations/pilot-runbook.md:33` | 07, 13 |
| P-23 | Backups cifrados y prueba de restauración verificada. El contrato pide definirlos; hoy no están implementados ni documentados. | `docs/api/pilot-contract.md:36` | 12 |
| P-24 | Responsable del tratamiento de los datos personales (clientes, técnicos y usuarios), custodia técnica, y retención y eliminación de datos personales, sesiones vencidas y auditoría. El código no borra ninguno de estos datos (no hay sentencias `DELETE` en el backend). | `backend/src/` | 13 |
| P-25 | Política de borrado local: qué se borra de IndexedDB, de la cola, de las evidencias y de Cache Storage al cerrar sesión, al perder el equipo o tras confirmar una operación. Hoy el cierre de sesión no borra esos datos. | `field-app/src/App.tsx`; `field-app/src/adapters/indexeddb/repository.ts` | 13 |
| P-26 | Aviso al técnico y contrato con el proveedor de teselas (`server.arcgisonline.com`), que recibe el número de tesela de la zona visible. | `field-app/src/services/map-cache.ts:9` | 13 |
| P-27 | Filas de personas en los seeds `backend/sql/seeds/005_definitive_seed.sql` y `006_replace-betanzos-20260923-jhonny.sql`, y en el historial de git (JSON retirado en D026). Decidir si se eliminan del repositorio y cómo. | `docs/DECISIONS.md` (D026) | 13 |

## Marcador de regla general

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-19 | Regla general del proyecto: no inventar columnas, estados, tarifas, contratos ni endpoints oficiales. No es un pendiente de negocio; se lista porque tiene el marcador. | `docs/RULES.md:41` | — |

---

Conteo de control (estado al 2026-10-12): las 17 ocurrencias del marcador en los documentos activos tienen una entrada: P-01 a P-03, P-05 a P-10 y P-12 a P-19. P-04, P-11, P-20, P-21 y P-22 no tienen marcador en el texto fuente; se incluyen porque la entrega debe cubrirlos. Verificar con `grep -rc "TODO: VALIDAR CON SEPSA" docs --include=*.md --exclude-dir=archive --exclude-dir=entrega-sepsa` (resultado: 17 en 8 archivos).

Se listan en el orden en que aparecen en la fuente, no por prioridad. Las prioridades se decidirán con SEPSA.

Conteo de la entrega (2026-10-13): hay 16 ocurrencias del marcador en `docs/entrega-sepsa/` (`02`: 6; `05`: 4; `12`: 1; `13`: 4; `README`: 1, que remite a esta lista), más dos menciones de este archivo que describen el marcador. Cada archivo con marcador cita entradas de esta lista: `02` cita P-01, P-04 a P-09 y P-20 a P-22; `05` cita P-01 y P-05; `12` cita P-11 a P-13, P-17 y P-23; `13` cita P-01, P-02, P-13 a P-15, P-17, P-18 y P-24 a P-27. Las columnas «Usado en» se regeneran desde esas citas. Todas las entradas tienen fuente.

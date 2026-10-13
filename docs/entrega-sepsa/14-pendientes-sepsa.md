# Pendientes para SEPSA

Fuente: marcadores `TODO: VALIDAR CON SEPSA` en los documentos activos de `docs/` (excluido `docs/archive/`), al 2026-10-12. Cada entrada apunta a la línea de origen.
Fecha: 2026-10-12
Estado: entrega, copia fechada. Ninguna entrada es una regla oficial: son preguntas que SEPSA debe responder.

Las 18 ocurrencias activas del marcador tienen entrada; además hay una entrada sin marcador (P-11). Si una fuente cambia o se resuelve un pendiente, se actualiza esta lista en la misma tarea.

## Reglas de corte y reconexión

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-01 | Reglas de elegibilidad para corte: umbral de facturas o mora, exclusión de intereses, bloqueo por CI/NIT, protección por reclamos y cargos o prioridad de reconexión. El código no las aplica como autoridad general. | `docs/RULES.md:48` | 01, 02 |
| P-02 | Umbrales y semántica definitiva de la captura de corte (lectura final, GPS, excepciones con motivo). | `docs/DOMAIN.md:54` | 01, 02 |
| P-03 | Política de conciliación oficial de operaciones de corte y reposición. | `docs/features/synchronization.md:63` | 01, 02 |
| P-04 | Política para resolver habilitaciones de reconexión expiradas, no encontradas o no consultables (`ENABLEMENT_RESERVATION_EXPIRED`, `ENABLEMENT_NOT_FOUND`, `ENABLEMENT_LOOKUP_UNKNOWN`). Hoy quedan para revisión del administrador. | `docs/DECISIONS.md:105` (D017) | 01, 02, 10 |

## Registro SC08

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-05 | Equivalencias entre los campos SC08 y el modelo operativo, y los puntos no confirmados. | `docs/DOMAIN.md:3` | 02, 05 |
| P-06 | `NIV_CALIDAD`: el caso exacto de 10.000 usuarios en la localidad. | `docs/DOMAIN.md:78` | 02 |
| P-07 | `DEMORA`: formato oficial y longitud máxima (el piloto limita a 1.000 caracteres). | `docs/DOMAIN.md:81` | 02, 05 |
| P-08 | `ENER_PROM`: periodo de cálculo frente a frecuencia de actualización. | `docs/DOMAIN.md:84` | 02, 05 |
| P-09 | `POT_FACT` e `IMP_REDUC`: significado y fuente. | `docs/DOMAIN.md:85` | 02, 05 |

## Arquitectura, operación y datos

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-10 | API oficial, límites y retención de los blobs de evidencia en IndexedDB y en el backend. | `docs/ARCHITECTURE.md:141` | 03, 13 |
| P-11 | Proveedor de métricas y alertas, umbrales, topología, TLS, rotación de secretos, rate limit distribuido y backup/restore. **Sin marcador en el texto**: `ARCHITECTURE.md:65` dice que "deben definirse para despliegue". Se incluye porque la entrega debe cubrirlo. | `docs/ARCHITECTURE.md:65` | 03, 07, 12 |
| P-12 | Límites de sesión por dispositivo, identidad de dispositivo y contrato de revocación. | `docs/ARCHITECTURE.md:65` | 12 |
| P-13 | Revocación de sesión por dispositivo (el esquema no liga la sesión a `device_id`). | `docs/api/pilot-contract.md:32` | 12 |
| P-14 | Almacenamiento oficial de evidencia, MIME, tamaño, retención y política de excepciones. | `docs/api/pilot-contract.md:38` | 12, 13 |
| P-15 | Retención y contrato oficial de fotos, límites de tamaño y MIME, y política de excepciones. | `docs/features/cuts.md:54` | 02, 13 |
| P-16 | Umbrales de validación de lecturas, políticas de privacidad y retención. | `docs/features/readings.md:24` | 02, 13 |
| P-17 | Proveedor cloud, topología, TLS, rotación de credenciales, retención y objetivos de recuperación (RPO y RTO). | `docs/operations/pilot-runbook.md:3` | 07, 08, 12 |
| P-18 | Retención oficial de la evidencia fotográfica almacenada en base de datos. | `docs/operations/pilot-runbook.md:33` | 07, 13 |

## Marcador de regla general

| ID | Qué debe confirmar SEPSA | Fuente | Usado en |
|---|---|---|---|
| P-19 | Regla general del proyecto: no inventar columnas, estados, tarifas, contratos ni endpoints oficiales. No es un pendiente de negocio; se lista porque tiene el marcador. | `docs/RULES.md:41` | 05, 06 |

---

Conteo de control: las 18 ocurrencias del marcador en los documentos activos tienen una entrada: P-01 a P-10 y P-12 a P-19. P-11 es el único pendiente sin marcador (ver su entrada). Verificar con `grep -rc "TODO: VALIDAR CON SEPSA" docs --include=*.md --exclude-dir=archive` antes de cerrar F0.

Se listan en el orden en que aparecen en la fuente, no por prioridad. Las prioridades se decidirán con SEPSA.

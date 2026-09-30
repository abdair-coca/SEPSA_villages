# Contrato HTTP provisional del piloto

El OpenAPI describe lo que `backend/src/application.ts` expone hoy. Es `PROVISIONAL`, `NO OFICIAL` y `PILOT_PROVISIONAL`; no está aprobado por SEPSA. Los clientes deben tratarlo como línea base de integración, no como garantía de compatibilidad oficial.

## Revisión rápida

1. Revisar [`pilot-provisional.openapi.json`](../../backend/openapi/pilot-provisional.openapi.json) para rutas, payloads, respuestas, roles y errores.
2. Revisar [`fixtures/pilot-contract.json`](../../backend/test/fixtures/pilot-contract.json) para muestras sintéticas sin credenciales ni tokens.
3. Ejecutar `npm test` desde `backend/` para validar schemas y respuestas de HTTP real contra `Application`.

## Semántica observada

| Área | Estado en el piloto |
|---|---|
| Autenticación | Login devuelve `session_token` en JSON y cookie `HttpOnly`; bearer y cookie autentican. Logout responde `204`. La forma documenta conducta actual; endurecimiento queda fuera de esta fase. |
| Órdenes | Solo `CUT`; creación responde `201`. Asignación requiere `expected_version`; conflicto de versión responde `409`. |
| Paquete técnico | Se liga al técnico de sesión y `device_id`. `authenticity`, `integrity`, checksum y versión son valores del piloto; no implican firma oficial. |
| Autorización | `POST /v1/authorizations/cut` reserva autorización. El token queda ligado a operación, orden, técnico, dispositivo y versión. El backend la consume dentro de la transacción de sync; no hay endpoint de consumo separado. |
| Sync | Acepta `CUT` y `VISIT`. ACK incluye `operation_id`, `order_id`, `technician_id`, `device_id`, versión esperada de autorización, acción, fecha, referencias y captura. Lookup devuelve `confirmed` solo si payload almacenado contiene recibo íntegro; legacy incompleto devuelve `unknown`. TECHNICIAN consulta solo sus operaciones; ADMIN puede consultar. Conflicto HTTP es `409`. Errores usan `{code,message}`. |
| Revisión | `POST /v1/sync/operations/{operation_id}/review` es solo ADMIN: exige identidad, `expected_version` y motivo. Cuando el lookup remoto no confirma la operación, registra `HUMAN_REVIEW_RECORDED`, conserva `PHYSICAL_UNKNOWN` y devuelve la nueva versión (`expected_version + 1`); no confirma ni reenvía. Ver [semántica de sincronización y revisión](../features/synchronization.md). |
| Auditoría | Solo `ADMIN`; opcional `order_id` UUID; límite observado: 1000 eventos. Campos dinámicos `transition` y `metadata` reflejan el registro actual. |

## Evidencia y pagos

Sync transporta `evidence_refs` y puede registrar `evidence_storage: LOCAL_ONLY`. Imagen permanece local: no existe endpoint de carga, bytes ni hash remoto verificado. No interpretar una referencia como evidencia remota validada. Contrato de almacenamiento, hash, tipos, retención y excepciones: `TODO: VALIDAR CON SEPSA`.

Integración de pagos está **NOT_IMPLEMENTED**: no hay rutas ni transporte de eventos, autorización o concurrencia de pagos en este contrato. No tratar campos observados como `payment_plan` como pago confirmado ni como autoridad. Fuente, estados, precedencia, idempotencia y conciliación: `TODO: VALIDAR CON SEPSA`.

## Límites de interpretación

- Schemas JSON describen la forma válida del cliente y casos observados. El parser actual valida campos requeridos y varios enums, pero tolera propiedades adicionales en algunos cuerpos; `additionalProperties: false` expresa payload canónico, no garantía de rechazo runtime de todo campo extra.
- Valores de catálogo, datos del Excel, significados de contexto y políticas oficiales siguen pendientes de validación.
- No hay contrato de API oficial ni semántica oficial de pagos/evidencia.

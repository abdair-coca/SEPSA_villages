# Requisitos funcionales y técnicos

Fuente: `docs/RULES.md`, `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/features/assignments.md`, `docs/features/cuts.md`, `docs/features/readings.md`, `docs/features/synchronization.md`, `docs/api/pilot-contract.md`, `docs/DECISIONS.md` (D003, D004, D007, D010, D015, D017, D018, D019, D020), `backend/src/shared/auth-crypto.ts`.
Fecha: 2026-10-12
Estado: entrega, copia fechada.

Este documento describe lo que el sistema debe hacer y el estado actual de cada requisito en el piloto provisional. Un requisito "Implementado" significa que existe en el código del repo y tiene pruebas, no que haya sido validado en campo ni aprobado por SEPSA. Los puntos que dependen de SEPSA están marcados con su identificador en [14-pendientes-sepsa.md](14-pendientes-sepsa.md).

## Convenciones

- **RF-xx**: requisito funcional.
- **RT-xx**: requisito técnico o no funcional.
- **Estado**: `Implementado` (en el piloto), `Parcial` (existe con límites), `Pendiente` (no existe en el piloto).
- Los contratos del piloto son `PILOT_PROVISIONAL`. No son la API oficial de SEPSA.

## Requisitos funcionales

### Acceso y roles

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-01 | Autenticación con dos roles: `ADMIN` y `TECHNICIAN`. La sesión viaja en cookie `HttpOnly`. Un usuario puede cambiar de rol solo entre los roles que tiene concedidos. | `docs/ARCHITECTURE.md`, `docs/api/pilot-contract.md` | Implementado |
| RF-02 | El técnico consulta y opera solo las órdenes asignadas a su identidad. El backend valida el permiso; ocultar un botón no basta. | `docs/RULES.md` (Reglas de producto), `docs/features/assignments.md` | Implementado |

### Administración de órdenes

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-03 | El administrador busca morosos con los filtros disponibles y revisa contexto, deuda y si existe una orden activa antes de crear una orden. | `docs/features/assignments.md` (Flujo 1 y 2) | Implementado |
| RF-04 | El administrador crea una orden individual para un suministro y selecciona el técnico. | `docs/features/assignments.md` (Flujo 3) | Implementado |
| RF-05 | No se crean órdenes activas duplicadas para el mismo suministro y propósito. Si existe una, se consulta. | `docs/RULES.md` (Reglas de producto), `docs/features/assignments.md` | Implementado |
| RF-06 | La asignación usa la versión esperada y un identificador de operación. Un conflicto de versión no sobrescribe la asignación existente. | `docs/features/assignments.md`, `docs/api/pilot-contract.md` (409) | Implementado |
| RF-07 | La creación masiva exige selección, vista previa, confirmación, lote idempotente y deduplicación. Es posterior a validar la orden individual de extremo a extremo. | `docs/features/assignments.md`, `docs/PROJECT.md` | Parcial: existe en el piloto; la validación prioritaria es la orden individual |
| RF-08 | Cada creación, asignación, autorización, ejecución y sincronización conserva actor, fecha, versión y resultado. Se registra en auditoría. | `docs/RULES.md` (Reglas de producto), `docs/ARCHITECTURE.md` (Recorrido, paso 7) | Implementado |
| RF-09 | Anulación de una orden generada por condición administrativa. | `docs/DOMAIN.md` (Estados de la orden) | Pendiente: el backend no expone esta operación; solo aparece el estado `ANULADO` en el tipo de la respuesta |
| RF-10 | Un conflicto, un técnico inválido, un suministro inexistente o un fallo posterior a la creación se conservan con su resultado para revisión. Nunca se repite la creación automáticamente. | `docs/features/assignments.md` (Casos especiales) | Implementado |

### Técnico: descarga, contexto y visita

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-11 | El técnico descarga su paquete de órdenes asignadas y lo consulta sin conexión: cliente, dirección, suministro, medidor, deuda y Kardex. | `docs/features/cuts.md` (Flujo 1 y 2), `docs/ARCHITECTURE.md` (Recorrido, paso 3) | Implementado |
| RF-12 | El técnico registra una visita o captura local sin afirmar que hubo corte físico. | `docs/features/cuts.md` (Flujo 3), `docs/DOMAIN.md` (Visita) | Implementado |

### Corte físico

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-13 | Un corte solo se ejecuta sobre una orden asignada, en estado `GENERADO` y sin reclamación física previa. | `docs/features/cuts.md` (Reglas) | Implementado |
| RF-14 | La lectura final del medidor es obligatoria para confirmar el corte: numérica, no negativa, en kWh, del medidor correcto, con fecha y estado `CAPTURED`. No se inventan lecturas. | `docs/features/readings.md` (Reglas), `docs/DOMAIN.md` (Captura de campo) | Implementado. Umbrales de validación: P-16 |
| RF-15 | El GPS son coordenadas válidas. Si no se pueden capturar, solo se permite la excepción controlada con motivo no vacío. | `docs/features/cuts.md`, `docs/features/readings.md` | Implementado |
| RF-16 | La evidencia fotográfica es JPEG o PNG optimizada, ligada a orden, operación, técnico y dispositivo. Si no se puede capturar, solo se permite la excepción controlada con motivo no vacío. La app reduce cada foto a ≤ 1 000 000 bytes antes de guardarla. | `docs/features/readings.md`, `docs/DECISIONS.md` (D018) | Implementado |
| RF-17 | La autorización de corte se pide en línea inmediatamente antes de cortar. Es concluyente, vigente, de un solo uso y ligada a orden, técnico, dispositivo, operación y versión. | `docs/RULES.md` (Reglas de producto), `docs/DECISIONS.md` (D004) | Implementado |
| RF-18 | Sin autorización concluyente y vigente no hay corte. Un rechazo explícito del backend o una sesión no válida quedan como visita bloqueada con su código. Un error 5xx, un replay de operación o un conflicto de identificador quedan como resultado incierto para revisión. Ningún caso autoriza el corte. | `docs/features/cuts.md` (Reglas), `docs/DECISIONS.md` (D015) | Implementado |
| RF-19 | El corte consume su autorización al confirmar el corte en la app. Si el consumo termina en resultado incierto (red, 15 s de espera o 5xx), la app lo reintenta con el mismo `operationId` y token, con esperas de 1 s y 3 s. Nunca pide una autorización nueva automáticamente. | `docs/DECISIONS.md` (D019, D020) | Implementado |
| RF-20 | Persistencia local antes de confirmar: antes de cualquier éxito visual, la intención o el resultado se guardan localmente, junto con su operación y su cola. | `docs/features/cuts.md` (Flujo 6 y regla final), `docs/DECISIONS.md` (D003) | Implementado |
| RF-21 | Estados físicos: `NONE`, `CLAIMED` (intención durable), `CONFIRMED` (resultado confirmado) y `PHYSICAL_UNKNOWN` (incierto). Un `PHYSICAL_UNKNOWN` requiere verificación humana y nunca se repite automáticamente. | `docs/DOMAIN.md` (Estado físico), `docs/features/cuts.md` (Estados especiales) | Implementado |
| RF-22 | La captura de corte contiene lectura final, medidor, tipo de corte, ubicación, precisión, disponibilidad y evidencia o excepción. Los umbrales de validación no están confirmados. | `docs/DOMAIN.md` (Captura de campo) | Parcial: umbrales pendientes (P-02) |

### Reposición y reconexión

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-23 | La reposición solo se registra sobre la orden de un corte confirmado. Un ciclo (corte y reposición) comparte el mismo `orderId` y no crea una identidad duplicada. | `docs/features/cuts.md` (Reposición y ciclo SC08), `docs/DECISIONS.md` (D010) | Implementado |
| RF-24 | El registro de la reposición guarda `effectiveAt` (instante capturado), el técnico con el nombre histórico y `DEMORA` (observación del técnico o `Sin demora`). | `docs/features/cuts.md` (Persistencia y captura), `docs/DOMAIN.md` (SC08) | Implementado. Formato de `DEMORA`: P-07 |
| RF-25 | Antes de confirmar la reposición en el servidor, se reserva una habilitación de un solo uso, ligada a orden, técnico, dispositivo, operación y versión. Al sincronizar, la orden pasa a `RECONEXIÓN`. | `docs/api/pilot-contract.md` (Habilitación de reposición y Sync), `docs/features/synchronization.md` (Contrato piloto) | Implementado (`PILOT_PROVISIONAL`) |
| RF-26 | Una reconexión no confirmada localmente se verifica solo consultando su habilitación por `operationId`. La cola de sincronización no la consulta ni la reintenta. | `docs/DECISIONS.md` (D017), `docs/features/synchronization.md` | Implementado |
| RF-27 | Las reglas de cargos y prioridad de reconexión no están confirmadas. El sistema no las aplica. | `docs/RULES.md` (Reglas observadas pero no vigentes) | Pendiente (P-01) |

### Sincronización y revisión

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RF-28 | La cola local conserva cada operación con identificador único, estado (`pending`, `syncing`, `synced`, `failed`), intentos y errores. Una operación no se elimina sin confirmación válida. | `docs/RULES.md` (Offline-first), `docs/features/synchronization.md` (Estados) | Implementado |
| RF-29 | La cola sobrevive a recarga, cierre, reinicio y pérdida temporal de red. | `docs/RULES.md` (Offline-first), `docs/features/synchronization.md` (Reglas) | Implementado |
| RF-30 | Antes de enviar un corte con foto, la evidencia se sube y se verifica. El backend acepta el corte solo si la evidencia está verificada y ligada a esa operación. | `docs/features/synchronization.md` (Flujo 4 y 5), `docs/api/pilot-contract.md` (Evidencia) | Implementado (`PILOT_PROVISIONAL`) |
| RF-31 | Una operación con respuesta perdida, timeout o respuesta ambigua se marca como `PHYSICAL_UNKNOWN` y se consulta su estado con el mismo identificador. Ningún resultado de consulta permite otro envío del POST. | `docs/features/synchronization.md` (Flujo 7 y Reglas) | Implementado |
| RF-32 | Un administrador registra una revisión de una operación incierta con motivo y versión esperada. La revisión no confirma el corte, no autoriza otra ejecución y no reenvía el POST. | `docs/features/synchronization.md` (Revisión humana ADMIN), `docs/api/pilot-contract.md` (Revisión) | Implementado (`PILOT_PROVISIONAL`). Política de SEPSA: P-04 |
| RF-33 | Las transiciones físicas son append-only y se escriben en la misma transacción local que la operación, la orden y la cola. | `docs/features/synchronization.md` (Reglas) | Implementado |
| RF-34 | Los mensajes de error dicen qué quedó guardado y cuál es el siguiente paso. La interfaz distingue guardado local, pendiente de sincronizar, sincronizado, fallido y revisión incierta. | `docs/RULES.md` (Datos e integración, Antes de entregar) | Implementado |
| RF-35 | La consulta de auditoría es exclusiva del administrador. | `docs/api/pilot-contract.md` (Auditoría) | Implementado |

## Requisitos técnicos y no funcionales

| ID | Requisito | Fuente | Estado |
|---|---|---|---|
| RT-01 | Interfaz en React con TypeScript y Vite. El campo es una PWA. | `docs/PROJECT.md` (Stack actual) | Implementado |
| RT-02 | Persistencia local en IndexedDB. El Service Worker cachea los recursos de la PWA. | `docs/PROJECT.md`, `docs/ARCHITECTURE.md` (Frontend) | Implementado |
| RT-03 | La sincronización usa cola local, reintentos, idempotencia y consulta de estado. | `docs/PROJECT.md` (Stack actual) | Implementado |
| RT-04 | Backend en Node.js con TypeScript, servidor HTTP propio y `pg` para PostgreSQL. | `docs/PROJECT.md`, `docs/ARCHITECTURE.md` (Backend) | Implementado |
| RT-05 | Esquema PostgreSQL mediante migraciones SQL. Las migraciones históricas no se modifican. | `docs/PROJECT.md`, `docs/RULES.md` (Método de trabajo) | Implementado |
| RT-06 | Capas del backend: controladores → servicios → repositorios → base de datos. Un controlador nunca ejecuta SQL. | `docs/ARCHITECTURE.md` (Backend), verificado en `backend/test/architecture.test.ts` | Implementado |
| RT-07 | Cookie de sesión `HttpOnly`, `SameSite=Lax`, `Path=/`. Con `COOKIE_SECURE=true` o `NODE_ENV=production`, además `Secure` y HSTS. El secreto de sesión nunca aparece en JSON ni en almacenamiento del navegador. | `docs/api/pilot-contract.md` (Autenticación), `docs/ARCHITECTURE.md` (Backend) | Implementado |
| RT-08 | CORS compara el origen exacto. Un POST con cookie exige el `Origin` permitido y rechaza `Sec-Fetch-Site: cross-site`. | `docs/api/pilot-contract.md` (Seguridad HTTP) | Implementado |
| RT-09 | Límite de intentos de login por dirección del socket y usuario normalizado: 5 intentos por 60 s por defecto. No confía en `X-Forwarded-For`. El estado vive en memoria de un proceso. | `docs/api/pilot-contract.md` (Seguridad HTTP) | Implementado. Store compartido: P-11 |
| RT-10 | Las contraseñas y los tokens se protegen con scrypt. Nunca se guardan en texto plano. | `backend/src/shared/auth-crypto.ts`, `docs/RULES.md` (Datos e integración) | Implementado |
| RT-11 | Los logs no contienen cuerpos, credenciales, cookies, tokens, evidencia ni datos personales. | `docs/api/pilot-contract.md` (Seguridad HTTP) | Implementado |
| RT-12 | Idempotencia por `operationId`: un replay idéntico devuelve el mismo recibo sin incrementar la versión; un contenido distinto produce conflicto `409`. | `docs/api/pilot-contract.md` (Sync), `docs/DECISIONS.md` (D007) | Implementado |
| RT-13 | El servidor recalcula el SHA-256 de cada foto. El límite del cuerpo HTTP es `HTTP_MAX_BODY_BYTES`: 12 MB por defecto y 2 MB en el despliegue. | `docs/api/pilot-contract.md` (Evidencia), `docs/DECISIONS.md` (D018) | Implementado |
| RT-14 | Dinero en centavos enteros o decimal determinista. | `docs/RULES.md` (Datos e integración) | Implementado en el piloto |
| RT-15 | Sin secretos en el frontend ni en la documentación activa. | `docs/RULES.md` (Datos e integración) | Implementado |
| RT-16 | Cada cambio de comportamiento, estado, permiso, persistencia o sincronización tiene pruebas. | `docs/RULES.md` (Método de trabajo) | Implementado. Inventario en `10-plan-pruebas.md` (F4) |
| RT-17 | El despliegue termina TLS antes de exponer el piloto. El backend no confía en cabeceras de proxy. | `docs/api/pilot-contract.md` (Seguridad HTTP y operación) | Pendiente: topología, proveedor y TLS (P-11) |
| RT-18 | Límites de sesión por dispositivo y contrato de revocación. | `docs/ARCHITECTURE.md` (Backend), `docs/api/pilot-contract.md` (Seguridad HTTP) | Pendiente (P-12, P-13) |

## Pendientes de este documento

Las reglas de corte no confirmadas (P-01), los umbrales de captura (P-02), la conciliación oficial (P-03), la política de habilitaciones no concluyentes (P-04) y los formatos SC08 (P-06 a P-09) no se presentan como requisitos cerrados. Ver [14-pendientes-sepsa.md](14-pendientes-sepsa.md).

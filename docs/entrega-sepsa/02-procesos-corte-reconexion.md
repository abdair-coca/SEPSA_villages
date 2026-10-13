# Procesos de corte y reconexión

Fuente: `docs/features/cuts.md`, `docs/features/readings.md`, `docs/features/assignments.md`, `docs/features/synchronization.md`, `docs/RULES.md`, `docs/DOMAIN.md`, `docs/api/pilot-contract.md`, `docs/DECISIONS.md` (D003, D010, D015, D017, D019, D020, D022, D024).
Fecha: 2026-10-13
Estado: entrega, copia fechada.

Este documento describe, paso a paso, cómo se ejecutan un corte y una reconexión en el piloto. Los identificadores `RF-xx` remiten a [01-requisitos-funcionales-tecnicos.md](01-requisitos-funcionales-tecnicos.md). Lo que depende de SEPSA está marcado con `TODO: VALIDAR CON SEPSA` y listado en [14-pendientes-sepsa.md](14-pendientes-sepsa.md).

## 1. Proceso de corte

### 1.1 Pasos

| Paso | Actor | Qué ocurre | Requisitos |
|---|---|---|---|
| 1 | Administrador | Busca un suministro moroso y crea una orden individual. Si ya existe una orden activa para el mismo suministro, la consulta en lugar de crear otra. Asigna un técnico con la versión esperada. | RF-03, RF-04, RF-05, RF-06 |
| 2 | Técnico | Descarga su paquete. Solo recibe las órdenes asignadas a su identidad. | RF-02, RF-11 |
| 3 | Técnico | Consulta cliente, suministro, medidor, deuda y Kardex sin conexión. Puede registrar una visita sin afirmar que hubo corte. | RF-11, RF-12 |
| 4 | Técnico | Captura la lectura final del medidor, el GPS y la evidencia fotográfica. Si no puede capturar GPS o foto, registra una excepción controlada con motivo. Cada valor se guarda localmente al momento de capturarlo. | RF-14, RF-15, RF-16 |
| 5 | Técnico | Pide la autorización de corte en línea, inmediatamente antes de cortar. Si la respuesta no es concluyente o es un rechazo, no corta (ver 1.3). | RF-17, RF-18 |
| 6 | App | Guarda en IndexedDB la intención (`CLAIMED`), la operación y la cola en una misma transacción. Solo después muestra «guardado en dispositivo». | RF-20, RF-21, RF-33 |
| 7 | Técnico | Confirma el corte. La app consume la autorización con su `operationId` y su token. Si el consumo queda incierto (red, 15 s de espera o 5xx), reintenta con el mismo `operationId` y token, con esperas de 1 s y 3 s. Nunca pide una autorización nueva. | RF-19 (D019, D020) |
| 8 | App | Sincroniza. Primero sube la evidencia y verifica su recibo. Después envía el corte. El backend lo acepta solo si la evidencia está verificada y ligada a la operación. | RF-28, RF-29, RF-30 |
| 9 | App y backend | Si el ACK es íntegro, la operación queda `synced`. Si falla, queda `failed` y se reintenta con el mismo identificador. Si la respuesta se pierde o es ambigua, queda `PHYSICAL_UNKNOWN`: se consulta el estado con el mismo identificador. Ningún resultado de consulta permite otro envío del POST. | RF-31 |
| 10 | Administrador | Consulta en solo lectura las operaciones por conciliar. No las resuelve desde la interfaz: la revisión con motivo existe solo como API y no confirma el corte ni reenvía el POST. | RF-37, RF-32 |

### 1.2 Estados

**Orden:** `GENERADO` → `EJECUTADO` → `RECONEXIÓN`. También existe `ANULADO`, pero el piloto no expone la anulación (RF-09).

**Estado físico:**
- `NONE`: sin reclamación física.
- `CLAIMED`: intención física durable, guardada en el dispositivo. No es confirmación remota.
- `CONFIRMED`: resultado físico confirmado.
- `PHYSICAL_UNKNOWN`: resultado incierto. Requiere verificación humana y no admite reintento físico automático.

**Sincronización:** `pending`, `syncing`, `synced`, `failed`. Un resultado incierto o una revisión pendiente se conserva en la cola.

### 1.3 Resultado de la autorización

| Respuesta del backend | Resultado local | Efecto |
|---|---|---|
| Autorización concluyente, vigente y de un solo uso | `CLAIMED` | Puede cortar |
| Rechazo explícito: `ORDER_NOT_FOUND`, `ORDER_NOT_ASSIGNED`, `VERSION_CONFLICT`, `ORDER_NOT_ELIGIBLE`, `PHYSICAL_STATUS_NOT_ELIGIBLE` | Visita bloqueada `NOT_AUTHORIZED`, con el código | No corta |
| Sesión no válida (401) | Visita bloqueada `NOT_AUTHORIZED` | No corta. Se registra como negativa (D015) |
| 5xx, timeout, `AUTHORIZATION_OPERATION_REPLAY`, `IDEMPOTENCY_CONFLICT` | `AUTHORIZATION_UNKNOWN`, para revisión | No corta. La acción física no se repite |

Fuente: `docs/features/cuts.md` (Reglas) y `docs/DECISIONS.md` (D015).

### 1.4 Trazabilidad de las reglas de producto

Cada regla de `docs/RULES.md` (sección "Reglas de producto") tiene su requisito en este documento o en el de requisitos:

| Regla de `docs/RULES.md` | Requisitos |
|---|---|
| `ADMIN` gestiona el piloto; `TECHNICIAN` opera solo órdenes asignadas | RF-01, RF-02 |
| Validar permisos en la capa autoritativa; ocultar un botón no es seguridad | RF-02, RT-06 |
| Una orden individual completa antes de ampliar la operación masiva | RF-07 |
| No crear órdenes activas duplicadas para el mismo suministro y propósito | RF-05 |
| Toda asignación, anulación, autorización, ejecución y sincronización conserva actor, fecha, versión y resultado | RF-08, RF-33 |
| Un corte físico exige autorización online concluyente, vigente y de un solo uso inmediatamente antes de ejecutarse | RF-17, RF-18 |
| Timeout, ausencia de respuesta, `unknown`, conflicto o datos obsoletos bloquean; nunca autorizan por inferencia | RF-18, RF-31 |
| Lectura final, GPS y evidencia reales y vinculados; solo GPS y fotos tienen excepciones controladas | RF-14, RF-15, RF-16 |

### 1.5 Nueva autorización cuando la anterior no se usó (D022)

Si la consulta de una autorización de corte incierta devuelve `expired`, `rejected` o `not_found`, el servidor demuestra que la autorización no se consumió. En ese caso, el técnico puede pedir una nueva después de confirmarlo. La app consulta al servidor en ese momento, cierra la operación anterior fuera de la cola, devuelve la orden a su estado previo, registra una visita de constancia y repite la acción con un identificador nuevo, la misma foto y los mismos datos. El administrador no interviene (RF-36).

La prueba es sobre la autorización, no sobre el medidor: la interfaz no afirma que la acción física no ocurrió. Un corte cuyo envío ya empezó no se cierra así.

## 2. Proceso de reconexión

La reconexión (reposición) se registra sobre el ciclo de un corte ya confirmado. Un ciclo comparte un único `orderId` (D010).

### 2.1 Pasos

| Paso | Actor | Qué ocurre | Requisitos |
|---|---|---|---|
| 1 | App | Verifica que existe un corte confirmado para la orden. Si no existe, no permite registrar la reposición. | RF-23 |
| 2 | Técnico | Confirma que realizó la reposición. La app guarda `effectiveAt` (instante capturado), el técnico con su nombre histórico y `DEMORA`: la observación o `Sin demora`. La operación queda `INTENT_PERSISTED` en el dispositivo. | RF-24 |
| 3 | App | Pide una habilitación online (`POST /v1/authorizations/reconnection`). Es de un solo uso y está ligada a orden, técnico, dispositivo, operación y versión. Una solicitud nueva puede reemplazar una reserva aún no consumida. Una habilitación ya consumida bloquea otro ciclo para esa orden. | RF-25 |
| 4 | App | Consume la habilitación con el mismo `operationId`. Si el consumo queda incierto, reintenta como en el corte (D019). Un replay idéntico del mismo `operationId` devuelve la misma respuesta. | RF-19 |
| 5 | App y backend | Sincroniza la operación `RECONNECTION`. El backend exige una habilitación consumida, `effective_at`, el snapshot del técnico y `demora`. El token de la habilitación no se reenvía en la sincronización. Con ACK íntegro, la orden pasa a `RECONEXIÓN` y la operación queda `synced`. | RF-25 |
| 6 | App | Si la reconexión no está confirmada localmente (`INTENT_PERSISTED` o `PHYSICAL_UNKNOWN`), se verifica solo consultando su habilitación por `operationId`: botón «Verificar con servidor» o al sincronizar. La cola de sincronización no la consulta ni la reintenta. | RF-26 (D017) |
| 7 | App | Si la consulta devuelve `expired`, `rejected` o `not_found`, el técnico puede pedir una habilitación nueva tras confirmarlo (D022, RF-36). Si la consulta no es concluyente (por ejemplo, `ENABLEMENT_LOOKUP_UNKNOWN`), la reconexión queda incierta con su código y no se envía. | RF-26, RF-36 |
| 8 | Administrador | Consulta en solo lectura las operaciones por conciliar (RF-37). Los casos no concluyentes siguen sin resolverse hasta que SEPSA defina la política (P-04). | RF-37. P-04 |

### 2.2 Estados de la reconexión

- `INTENT_PERSISTED`: registrada en el dispositivo; no hay confirmación remota.
- `PHYSICAL_UNKNOWN`: incierta; requiere verificación.
- Confirmada: solo con ACK íntegro del backend.
- Habilitación: `consumed` (consumida), `expired` (vencida), `rejected` (rechazada), `not_found` (no encontrada), `not_enabled` (no consumida).

### 2.3 Reglas de la reconexión

- La reconexión solo se confirma con ACK íntegro o con la consulta de la habilitación.
- Ninguna reconexión incierta se reenvía automáticamente.
- Los cargos y la prioridad de reconexión no están confirmados (sección 4).

## 3. Campos SC08

La tabla oficial SC08 de cortes y reposiciones fue recibida por el equipo, pero no está en el repo. Esta sección sigue su descripción en `docs/DOMAIN.md`, donde cada ciclo histórico ocupa una fila: un corte y su reposición, si existe. Los campos obligatorios de SC08 no se han verificado contra la tabla original, así que el estado de cada campo aparece aquí tal como está documentado.

| Campo | Significado | Fuente actual en el piloto | Estado |
|---|---|---|---|
| NRO_CUENTA | Cuenta del suministro | `CODIGO` del Excel, guardado como `debtors.account_id` | Provisional. Equivalencia pendiente: P-05 |
| NOMBRE | Nombre del cliente | `NOMBRE` del Excel, guardado como `debtors.customer_name` | Provisional. P-05 |
| DIRECCION | Dirección del suministro | `DIRECCION` del Excel, guardado como `debtors.address`. Las referencias van aparte en `reference_text` | Provisional. P-05 |
| MEDIDOR | Medidor del suministro | Normalizado en `meter_id`; la marca, en `meter_brand` si viene indicada | Provisional. P-05 |
| AREA | Área del suministro | Código en `debtors.area`; nombre en `context.area_name` | Pendiente: confirmar si SC08 espera código, nombre o ambos (P-05) |
| LOCALIDAD | Localidad | Código y nombre juntos en `debtors.locality` (por ejemplo, `078 - COA COA`) | Pendiente: confirmar formato de salida (P-05) |
| NRO_CORREL | Número correlativo | Lo asigna SEPSA | Pendiente: no se define cómo lo recibirá la aplicación (P-20) |
| NIV_CALIDAD | Nivel de calidad | Definido por SEPSA según usuarios de la localidad: nivel 1 si supera 10.000; nivel 2 si es menor de 10.000 | Pendiente: caso exacto de 10.000 usuarios (P-06) |
| FECHA_REPO | Fecha de la reposición | Se captura al confirmar la reposición, en hora de Bolivia (`America/La_Paz`) | Definido. Su presentación en SC08 no está verificada en el piloto |
| HORA_REPO | Hora de la reposición | Igual que FECHA_REPO | Definido. Igual que FECHA_REPO |
| TIEMPO | Días desde el pago hasta la reposición, con dos decimales | Requiere la fecha de pago | Pendiente: la fuente de la fecha de pago no está definida (P-21) |
| DEMORA | Observación del técnico sobre la reposición | Texto del técnico, o `Sin demora`. El piloto limita el texto a 1.000 caracteres | Pendiente: formato y longitud oficiales (P-07) |
| TEC_CORTE | Técnico que realizó el corte | Nombre histórico del técnico en la fecha del evento | Implementado (snapshot) |
| TEC_REPOS | Técnico que realizó la reposición | Nombre histórico del técnico en la fecha del evento | Implementado (snapshot) |
| ENER_PROM | Promedio de energía | Dato semestral calculado a partir de los cortes | Pendiente: periodo de cálculo y frecuencia (P-08) |
| POT_FACT | No definido en la documentación | No hay fuente identificada | Pendiente: significado y fuente (P-09) |
| IMP_REDUC | No definido en la documentación | No hay fuente identificada | Pendiente: significado y fuente (P-09) |
| FECHA_PAGO | Fecha de pago del consumidor | Fuera del alcance del piloto | Pendiente: fuente autorizada (P-21) |
| HORA_PAGO | Hora de pago del consumidor | Fuera del alcance del piloto | Pendiente: fuente autorizada (P-21) |

Además, el formato y el destino de salida SC08 (archivo o API) no están definidos (P-22). Por eso ninguna fila se presenta como registro oficial.

## 4. Reglas no vigentes

Los documentos históricos describen las siguientes reglas. El código actual no las aplica como autoridad general. Se mantienen como pendientes y no se implementan por inferencia:

- Umbral fijo de facturas o mora. `TODO: VALIDAR CON SEPSA`.
- Exclusión de intereses. `TODO: VALIDAR CON SEPSA`.
- Bloqueo por CI o NIT. `TODO: VALIDAR CON SEPSA`.
- Protección por reclamos. `TODO: VALIDAR CON SEPSA`.
- Cargos y prioridad de reconexión. `TODO: VALIDAR CON SEPSA`.

Todas quedan en [14-pendientes-sepsa.md](14-pendientes-sepsa.md) bajo P-01.

**Excepción en el código.** La carga de datos de prueba (`backend/migrations/20260923-load-excel-20260922.mjs`, que se ejecuta a mano desde D026) y el script de importación (`backend/scripts/import-debtors-xlsx.py`) aplican el umbral de tres meses (`months_pending >= 3`) para crear órdenes de corte. El umbral no es una autoridad general del sistema, pero sí está codificado en esos dos scripts. Esta entrega lo documenta como hecho del código y no como regla confirmada: sigue pendiente de SEPSA (P-01).

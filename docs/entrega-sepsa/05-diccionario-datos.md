# Diccionario de datos del piloto

Fuente: `backend/sql/001_init.sql`, `002_evidence_assets.sql`, `003_payment_observations.sql`, `003_reference_fields.sql`, `007_role_grants.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql`. Columnas extraídas de las migraciones con un script de solo lectura. Las descripciones se redactaron desde `docs/DOMAIN.md`, `docs/RULES.md`, `docs/features/`, `docs/api/pilot-contract.md` y el código de `backend/src/`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el esquema de las migraciones del repo; la base desplegada puede diferir si se aplicaron migraciones en otro orden (ver Discrepancias).

Este documento describe 13 tablas y 147 columnas. Cada tabla y cada columna aparece con su nombre en español y, entre paréntesis, el nombre técnico que usa la base de datos y el código. **Los nombres técnicos no se cambian**: son los que hay que buscar en la base, en las consultas y en el código.

Para leer las tablas, primero conviene revisar el [glosario](#glosario-de-términos-y-estados). Las claves y los valores técnicos (por ejemplo `CLAIMED`) aparecen tal cual en el sistema; el glosario explica su significado.

## Glosario de términos y estados

### Términos del negocio

| Término | Significado |
|---|---|
| Moroso | Suministro con deuda que puede recibir una orden de corte. |
| Orden de corte | Trabajo que el administrador crea para un suministro moroso y asigna a un técnico. |
| Asignación | Registro de a qué técnico se entrega una orden y cuándo. |
| Paquete de trabajo | Conjunto de órdenes que el técnico descarga para trabajar sin conexión. |
| Visita | Presencia del técnico en el domicilio. No confirma que hubo corte. |
| Corte | Corte físico del suministro. Solo se realiza con autorización en línea. |
| Reconexión (reposición) | Restablecimiento del suministro después de un corte confirmado. |
| Autorización de corte | Permiso en línea y de un solo uso para cortar una orden. |
| Habilitación de reconexión | Permiso en línea y de un solo uso para registrar una reconexión. |
| Operación de sincronización | Acción del dispositivo que se envía al servidor. |
| Evidencia | Fotografía de campo vinculada a una orden y a una operación. |
| Auditoría | Registro de quién hizo qué, cuándo y con qué resultado. |
| Revisión humana | Revisión de un administrador sobre una operación incierta. No confirma ni repite la acción física. |
| Legado | Dato o tabla conservado del pasado, sin uso operativo en el piloto. |

### Estados y valores del sistema

| Campo | Valor del sistema | Significado |
|---|---|---|
| Estado de la orden | `GENERADO` | Orden generada, pendiente de ejecutar. |
| Estado de la orden | `EJECUTADO` | Corte ejecutado. |
| Estado de la orden | `ANULADO` | Orden anulada. El piloto no expone la anulación. |
| Estado de la orden | `RECONEXIÓN` | Orden en reconexión. |
| Estado físico | `NONE` | Sin reclamación física. |
| Estado físico | `CLAIMED` | Reclamado: la intención está guardada en el dispositivo, sin confirmación del servidor. |
| Estado físico | `CONFIRMED` | Resultado físico confirmado. |
| Estado físico | `PHYSICAL_UNKNOWN` | Resultado físico incierto. Requiere revisión humana y no se repite la acción. |
| Estado de autorización | `RESERVED` | Reservada, pendiente de consumo. |
| Estado de autorización | `CONSUMED` | Consumida por una operación. |
| Estado de autorización | `EXPIRED` | Vencida. |
| Estado de autorización | `REJECTED` | Rechazada. |
| Estado de operación de sincronización | `pending` | Pendiente. |
| Estado de operación de sincronización | `acknowledged` | Confirmada por el servidor. |
| Estado de operación de sincronización | `conflict` | En conflicto. |
| Estado de comando | `pending` | Pendiente. |
| Estado de comando | `completed` | Completado. |
| Estado de evidencia | `verified` | Verificada por el servidor. |
| Resultado de auditoría | `accepted` | Aceptada. |
| Resultado de auditoría | `rejected` | Rechazada. |
| Tipo de operación o habilitación | `CUT` | Corte. |
| Tipo de operación o habilitación | `VISIT` | Visita. |
| Tipo de operación o habilitación | `RECONNECTION` | Reconexión. |
| Rol | `ADMIN` | Administrador. |
| Rol | `TECHNICIAN` | Técnico. |
| Origen | `PILOT_PROVISIONAL` | Piloto provisional. No es un dato oficial de SEPSA. |
| Cola en el dispositivo | `pending` / `syncing` / `synced` / `failed` | Pendiente / enviando / sincronizado / fallido. No está en estas tablas: vive en IndexedDB del dispositivo. |

### Términos técnicos

| Término | Significado |
|---|---|
| Clave principal | Identificador único de cada fila. |
| Clave foránea | Columna que apunta a una fila de otra tabla. |
| Migración | Archivo SQL que crea o cambia la base de datos. |
| Huella (hash) | Resumen de 64 caracteres calculado a partir de un contenido. Sirve para detectar cambios. |
| Token | Clave de un solo uso que autoriza una acción. |
| Replay | Repetición de la misma petición. El sistema responde igual y no repite el efecto. |
| Idempotencia | Propiedad de repetir una operación sin duplicar su efecto. |
| Snapshot | Copia de un dato tal como estaba en el momento del evento. |
| ACK | Confirmación de recepción enviada por el servidor. |
| Payload | Contenido completo de una operación enviada. |
| Transacción | Conjunto de cambios que se confirma completo o no se confirma. |
| Controladores (`controllers`) | Reciben la petición HTTP, validan su forma y el rol, y llaman al servicio. |
| Servicios (`services`) | Reglas de negocio y transacciones. |
| Repositorios (`repositories`) | Consultas SQL. |
| Mapeadores (`mappers`) | Convierten filas de la base en respuestas JSON. |
| Endpoint | Dirección de la API que atiende una acción. |
| IndexedDB | Base de datos del navegador del dispositivo. |
| Service Worker | Programa del navegador que guarda recursos para trabajar sin conexión. |

## Clasificación de columnas

| Clasificación | Significado |
|---|---|
| En uso | La usa una operación del piloto: acceso, órdenes, autorización, sincronización o auditoría. |
| Provisional | Viene de la carga Excel o del piloto. No es un dato oficial de SEPSA. |
| Histórica | Viene de la carga histórica. Se conserva sin regla operativa en el piloto. |
| Control técnico | Control de origen, fecha o versión. |
| Legado de pagos | Relacionada con pagos. El repo no le da comportamiento operativo (`docs/RULES.md`). 12 columnas. |
| Legado de reconexión | Campo histórico de reconexión que no sustituye el registro por operación (`docs/features/synchronization.md`). 2 columnas. |

Total de columnas marcadas como legado: 14 (12 de pagos y 2 de reconexión).

Códigos de migración: `001` = 001_init.sql, `002` = 002_evidence_assets.sql, `003p` = 003_payment_observations.sql, `003r` = 003_reference_fields.sql, `007g` = 007_role_grants.sql, `007w` = 007_work_package_versions.sql, `008` = 008_reconnection_schema.sql.

## Tablas

## Usuarios (`users`)

Clave principal: Identificador de usuario (`user_id`). Columnas: 8.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de usuario | `user_id` | uuid | No | — | Clave principal | 001 | En uso | Identificador de la cuenta. |
| Nombre de acceso | `username` | text | No | — | Única | 001 | En uso | Nombre de acceso. Único; el login lo normaliza. |
| Nombre visible | `display_name` | text | No | — | — | 001 | En uso | Nombre visible en la interfaz y en los registros. |
| Rol inicial | `role` | text | No | — | CHECK (role IN ('ADMIN', 'TECHNICIAN')) | 001 | En uso | Rol inicial de la cuenta: `ADMIN` (administrador) o `TECHNICIAN` (técnico). Los roles concedidos están en `user_role_grants`. |
| Hash de la contraseña | `password_hash` | text | No | — | — | 001 | En uso | Hash scrypt de la contraseña. Nunca se guarda en texto plano. Dato sensible. |
| Cuenta activa | `enabled` | boolean | No | true | — | 001 | En uso | Indica si la cuenta puede iniciar sesión. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Fecha de creación | `created_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de creación de la cuenta. |

## Sesiones (`sessions`)

Clave principal: Identificador de sesión (`session_id`). Columnas: 8.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de sesión | `session_id` | uuid | No | — | Clave principal | 001 | En uso | Identificador de la sesión. |
| Usuario | `user_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Usuario de la sesión. |
| Huella del token | `token_hash` | char(64) | No | — | Única | 001 | En uso | Hash de 64 caracteres del token de sesión. El token solo viaja en la cookie `HttpOnly`. |
| Fecha de vencimiento | `expires_at` | timestamptz | No | — | — | 001 | En uso | Vencimiento de la sesión. |
| Fecha de cierre | `revoked_at` | timestamptz | Sí | — | — | 001 | En uso | Momento de cierre de la sesión. Nulo mientras la sesión esté activa. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Fecha de creación | `created_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de creación de la sesión. |
| Rol activo | `active_role` | text | Sí | — | CHECK (active_role IN ('ADMIN', 'TECHNICIAN')) | 007g | En uso | Rol activo de la sesión: `ADMIN` (administrador) o `TECHNICIAN` (técnico). Debe estar concedido en `user_role_grants`. Se añade en la migración 007. |

## Morosos y suministros (`debtors`)

Clave principal: Identificador del moroso (`debtor_id`). Columnas: 34.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador del moroso | `debtor_id` | text | No | — | Clave principal | 001 | En uso | Identificador interno del registro de morosidad. |
| Cuenta | `account_id` | text | No | — | Única | 001 | Provisional | Cuenta (`CODIGO` del Excel). Única. Equivalencia con SC08 pendiente (P-05). |
| Suministro | `supply_id` | text | No | — | Única | 001 | Provisional | Identificador del suministro. Única. La relación cuenta-suministro está pendiente (P-05). |
| Nombre del cliente | `customer_name` | text | No | — | — | 001 | Provisional | Nombre del cliente (`NOMBRE` del Excel). Dato personal. |
| Dirección | `address` | text | No | — | — | 001 | Provisional | Dirección del suministro (`DIRECCION` del Excel). Dato personal. |
| Referencias de la dirección | `reference_text` | text | No | '' | — | 001 | Provisional | Referencias complementarias de la dirección. No sustituyen la dirección. |
| Medidor | `meter_id` | text | No | — | — | 001 | Provisional | Medidor, normalizado desde `MEDIDOR`. |
| Área | `area` | text | No | — | — | 001 | Provisional | Código de área (`AREA COD`). Si SC08 espera código, nombre o ambos, está pendiente (P-05). |
| Localidad | `locality` | text | No | — | — | 001 | Provisional | Código y nombre de localidad (`LOC COD` y `LOCALIDAD`), por ejemplo `078 - COA COA`. Formato de salida pendiente (P-05). |
| Ruta | `route` | text | No | — | — | 001 | Provisional | Ruta. Es filtro de búsqueda del administrador. Significado oficial no documentado (P-05). |
| Deuda en centavos | `debt_cents` | integer | No | — | CHECK (debt_cents >= 0) | 001 | En uso | Deuda total en centavos enteros. |
| Meses pendientes | `months_pending` | integer | No | — | CHECK (months_pending >= 0) | 001 | En uso | Meses con deuda pendiente. |
| Historial de movimientos (kardex) | `kardex` | jsonb | No | '[]'::jsonb | — | 001 | En uso | Historial de movimientos de la cuenta en JSON. Lo muestra el detalle del moroso y el contexto del técnico. |
| Contexto | `context` | jsonb | No | '{}'::jsonb | — | 001 | En uso | Contexto adicional en JSON. Incluye `area_name` y `ruta_name`. |
| Última actualización | `updated_at` | timestamptz | Sí | — | — | 001 | Control técnico | Última actualización del registro. Puede ser nulo tras la carga histórica. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Circuito | `circuit` | text | No | '' | — | 001 | Histórica | Circuito del suministro, de la carga histórica. Sin regla operativa en el piloto. |
| Documento de identidad del cliente | `customer_ci` | text | Sí | — | — | 001 | Histórica | Documento de identidad del cliente. Dato personal. La regla de bloqueo por CI o NIT no está vigente (P-01). |
| Teléfono de contacto | `contact_phone` | text | Sí | — | — | 001 | Histórica | Teléfono de contacto. Dato personal. |
| Tarifa | `tariff` | text | No | '' | — | 001 | Histórica | Tarifa, de la carga histórica. El piloto no calcula tarifas (`docs/RULES.md`). |
| Estado del suministro | `supply_status` | text | No | '' | — | 001 | Histórica | Estado del suministro, de la carga histórica. Se usa como filtro de búsqueda. |
| Título de habilitación | `enabling_title` | text | Sí | — | — | 001 | Histórica | Título de habilitación de la carga histórica. Significado no documentado (P-05). |
| Orden de recorrido | `route_order` | integer | Sí | — | — | 001 | Histórica | Orden de recorrido dentro de la ruta, de la carga histórica. |
| Latitud catastral | `cadastral_latitude` | numeric | Sí | — | — | 001 | Histórica | Latitud catastral, de la carga histórica. Precisión distinta según la migración (ver Discrepancias). |
| Longitud catastral | `cadastral_longitude` | numeric | Sí | — | — | 001 | Histórica | Longitud catastral, de la carga histórica. Precisión distinta según la migración (ver Discrepancias). |
| Marca del medidor | `meter_brand` | text | Sí | — | — | 001 | Provisional | Marca del medidor, si viene indicada en la carga (`MEDIDOR`). |
| Índice del medidor | `meter_index` | text | Sí | — | — | 001 | Histórica | Índice del medidor, de la carga histórica. |
| Multiplicador del medidor | `meter_multiplier` | integer | Sí | — | — | 001 | Histórica | Multiplicador del medidor, de la carga histórica. Tipo distinto según la migración (ver Discrepancias). |
| Reclamos | `claims` | boolean | Sí | — | — | 001 | Histórica | Indicador de reclamos de la carga histórica. La protección por reclamos no está vigente (P-01). |
| Plan de pagos | `payment_plan` | boolean | Sí | — | — | 001 | Legado de pagos | Indicador de plan de pagos. La app y el backend no lo exponen ni le dan comportamiento. |
| Fecha de suspensión | `suspension_date` | timestamptz | Sí | — | — | 001 | Histórica | Fecha de suspensión de la carga histórica. Se expone en el mapper, sin regla operativa. |
| Reconexión manual | `reconnection_manual` | boolean | Sí | — | — | 001 | Histórica | Indicador de reconexión manual de la carga histórica. |
| Fecha de reconexión (histórica) | `reconnection_date` | timestamptz | Sí | — | — | 001 | Legado de reconexión | Fecha de reconexión histórica. No sustituye el registro por operación (`docs/features/synchronization.md`). |
| Técnico de reconexión (histórico) | `reconnection_technician` | text | Sí | — | — | 001 | Legado de reconexión | Técnico de la reconexión histórica. No sustituye el registro por operación (`docs/features/synchronization.md`). |

## Órdenes de corte (`orders`)

Clave principal: Identificador de orden (`order_id`). Columnas: 12.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de orden | `order_id` | uuid | No | — | Clave principal | 001 | En uso | Identificador de la orden. |
| Código CUC | `cuc` | text | Sí | — | Única | 001 | En uso | Identificador de la orden con prefijo `CUC-`, generado por el backend al crear la orden. Significado oficial no documentado. |
| Moroso | `debtor_id` | text | No | — | Clave foránea → Morosos y suministros (`debtors.debtor_id`) | 001 | En uso | Suministro moroso al que se refiere la orden. |
| Propósito | `purpose` | text | No | — | CHECK (purpose = 'CUT') | 001 | En uso | Propósito de la orden. Hoy solo `CUT` (corte). |
| Estado de la orden | `status` | text | No | — | CHECK (status IN ('GENERADO', 'EJECUTADO', 'ANULADO')) | 001 | En uso | Estado de la orden: `GENERADO` (generada), `EJECUTADO` (ejecutada), `ANULADO` (anulada) o `RECONEXIÓN` (en reconexión). El piloto no expone la anulación (RF-09). |
| Estado físico | `physical_status` | text | No | — | CHECK (physical_status IN ('NONE', 'CLAIMED', 'CONFIRMED', 'PHYSICAL_UNKNOWN')) | 001 | En uso | Estado físico: `NONE` (sin reclamación), `CLAIMED` (reclamado: intención guardada en el dispositivo), `CONFIRMED` (confirmado) o `PHYSICAL_UNKNOWN` (resultado incierto; requiere revisión humana). |
| Versión | `version` | integer | No | — | CHECK (version > 0) | 001 | En uso | Versión de la orden. Control de concurrencia. |
| Creada por | `created_by` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Administrador que creó la orden. |
| Técnico asignado | `assigned_technician_id` | uuid | Sí | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Técnico asignado actualmente. Nulo si no hay asignación. |
| Fecha de creación | `created_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de creación de la orden. |
| Última actualización | `updated_at` | timestamptz | No | now() | — | 001 | Control técnico | Último cambio de la orden. Ordena la consulta del técnico. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |

## Asignaciones de órdenes (`order_assignments`)

Clave principal: Identificador de asignación (`assignment_id`). Columnas: 8.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de asignación | `assignment_id` | uuid | No | — | Clave principal | 001 | En uso | Identificador de la asignación. |
| Orden | `order_id` | uuid | No | — | Clave foránea → Órdenes de corte (`orders.order_id`) | 001 | En uso | Orden asignada. |
| Técnico | `technician_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Técnico al que se asigna la orden. |
| Técnico anterior | `from_technician_id` | uuid | Sí | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Técnico anterior, si la orden se reasignó. |
| Asignada por | `assigned_by` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Administrador que hizo la asignación. |
| Versión | `version` | integer | No | — | — | 001 | En uso | Versión de la orden tras la asignación. |
| Fecha de asignación | `assigned_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de la asignación. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |

## Operaciones de comando (`command_operations`)

Clave principal: Identificador de operación (`operation_id`). Columnas: 8.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de operación | `operation_id` | text | No | — | Clave principal | 001 | En uso | Identificador único del comando. Base de la idempotencia. |
| Tipo de comando | `operation_type` | text | No | — | — | 001 | En uso | Tipo de comando ejecutado. |
| Usuario que ejecutó | `actor_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Usuario que ejecutó el comando. |
| Huella de la petición | `request_hash` | char(64) | No | — | — | 001 | En uso | Hash de 64 caracteres del contenido de la petición. Detecta reutilización del identificador con contenido distinto. |
| Estado | `status` | text | No | — | CHECK (status IN ('pending', 'completed')) | 001 | En uso | `pending` (pendiente) o `completed` (completado). |
| Respuesta guardada | `response` | jsonb | Sí | — | — | 001 | En uso | Respuesta guardada para devolver el mismo resultado en un replay. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Fecha de creación | `created_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de creación del comando. |

## Autorizaciones de corte (`cut_authorizations`)

Clave principal: Identificador de autorización (`authorization_id`). Columnas: 15.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de autorización | `authorization_id` | uuid | No | — | Clave principal | 001 | En uso | Identificador de la autorización. |
| Identificador de operación | `operation_id` | text | No | — | Única | 001 | En uso | Operación que reservó la autorización. Única. |
| Orden | `order_id` | uuid | No | — | Clave foránea → Órdenes de corte (`orders.order_id`) | 001 | En uso | Orden autorizada. |
| Técnico | `technician_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Técnico autorizado. |
| Dispositivo | `device_id` | text | No | — | — | 001 | En uso | Dispositivo que pidió la autorización. |
| Versión de la orden | `order_version` | integer | No | — | — | 001 | En uso | Versión de la orden fijada por la autorización. |
| Huella del token | `token_hash` | char(64) | No | — | Única | 001 | En uso | Hash de 64 caracteres del token de un solo uso. El token no se guarda en claro. |
| Estado | `status` | text | No | — | CHECK (status IN ('RESERVED', 'CONSUMED', 'EXPIRED', 'REJECTED')) | 001 | En uso | `RESERVED` (reservada), `CONSUMED` (consumida), `EXPIRED` (vencida) o `REJECTED` (rechazada). |
| Fecha de vencimiento | `expires_at` | timestamptz | No | — | — | 001 | En uso | Vencimiento de la reserva. |
| Fecha de consumo | `consumed_at` | timestamptz | Sí | — | — | 001 | En uso | Momento del consumo. |
| Operación que la consumió | `consumed_operation_id` | text | Sí | — | — | 001 | En uso | Operación que consumió la autorización. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Fecha de reserva | `created_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de la reserva. |
| Tipo de habilitación | `action` | text | No | 'CUT' | — | 008 | En uso | Tipo de habilitación: `CUT` (corte) o `RECONNECTION` (reconexión), desde la migración 008. |
| Nombre del técnico (histórico) | `technician_name_snapshot` | text | Sí | — | — | 008 | En uso | Nombre del técnico en el momento de la reconexión. Snapshot histórico (008). |

## Operaciones de sincronización (`sync_operations`)

Clave principal: Identificador de operación (`operation_id`). Columnas: 12.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de operación | `operation_id` | text | No | — | Clave principal | 001 | En uso | Identificador de la operación enviada. Clave primaria e idempotencia. |
| Técnico | `technician_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Técnico que envió la operación. |
| Dispositivo | `device_id` | text | No | — | — | 001 | En uso | Dispositivo que envió la operación. |
| Orden | `order_id` | uuid | No | — | Clave foránea → Órdenes de corte (`orders.order_id`) | 001 | En uso | Orden de la operación. |
| Tipo de operación | `action` | text | No | — | CHECK (action IN ('CUT', 'VISIT')) | 001 | En uso | Tipo de operación: `CUT` (corte) y `VISIT` (visita), desde 001; `RECONNECTION` (reconexión), desde 008. |
| Contenido | `payload` | jsonb | No | — | — | 001 | En uso | Contenido completo de la operación en JSON. Se guarda para comparar replays. |
| Huella del contenido | `payload_hash` | char(64) | No | — | — | 001 | En uso | Hash del payload. Un replay con contenido distinto produce conflicto. |
| Estado | `status` | text | No | — | CHECK (status IN ('pending', 'acknowledged', 'conflict')) | 001 | En uso | `pending` (pendiente), `acknowledged` (confirmada por el servidor) o `conflict` (en conflicto). |
| Motivo del conflicto | `conflict_reason` | text | Sí | — | — | 001 | En uso | Motivo del conflicto, si lo hay. |
| Fecha de confirmación | `acknowledged_at` | timestamptz | Sí | — | — | 001 | En uso | Momento del ACK del backend. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Fecha de recepción | `created_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento de recepción de la operación. |

## Eventos de auditoría (`audit_events`)

Clave principal: Identificador del evento (`audit_id`). Columnas: 14.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador del evento | `audit_id` | uuid | No | — | Clave principal | 001 | En uso | Identificador del evento de auditoría. |
| Usuario | `actor_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 001 | En uso | Usuario que realizó la acción. |
| Rol del usuario | `actor_role` | text | Sí | — | CHECK (actor_role IN ('ADMIN', 'TECHNICIAN')) | 001 | En uso | Rol activo al ejecutar la acción: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |
| Acción | `action` | text | No | — | — | 001 | En uso | Acción registrada. |
| Entidad afectada | `entity_id` | text | Sí | — | — | 001 | En uso | Identificador de la entidad afectada. |
| Orden | `order_id` | uuid | Sí | — | Clave foránea → Órdenes de corte (`orders.order_id`) | 001 | En uso | Orden relacionada, si la hay. |
| Operación | `operation_id` | text | Sí | — | — | 001 | En uso | Operación relacionada, si la hay. |
| Resultado | `result` | text | No | — | CHECK (result IN ('accepted', 'rejected')) | 001 | En uso | `accepted` (aceptada) o `rejected` (rechazada). |
| Motivo | `reason` | text | Sí | — | — | 001 | En uso | Motivo. La vista del administrador oculta motivos con términos de pago (`backend/src/repositories/audit.repository.ts`). |
| Dispositivo | `device_id` | text | Sí | — | — | 001 | En uso | Dispositivo que originó la acción. |
| Cambio de estado | `transition` | jsonb | Sí | — | — | 001 | En uso | Cambio de estado registrado, en JSON. |
| Datos adicionales | `metadata` | jsonb | Sí | — | — | 001 | En uso | Datos adicionales de la acción, en JSON. |
| Fecha del evento | `occurred_at` | timestamptz | No | now() | — | 001 | Control técnico | Momento del evento. Ordena la consulta de auditoría. |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 001 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |

## Evidencias fotográficas (`evidence_assets`)

Clave principal: Identificador de evidencia (`evidence_id`). Columnas: 11.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de evidencia | `evidence_id` | text | No | — | Clave principal | 002 | En uso | Identificador de la evidencia. Reutilizar el mismo identificador con otro contenido produce conflicto. |
| Orden | `order_id` | uuid | No | — | Clave foránea → Órdenes de corte (`orders.order_id`) | 002 | En uso | Orden a la que pertenece la evidencia. |
| Operación | `operation_id` | text | No | — | — | 002 | En uso | Operación a la que pertenece la evidencia. |
| Técnico | `technician_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 002 | En uso | Técnico que capturó la evidencia. |
| Dispositivo | `device_id` | text | No | — | — | 002 | En uso | Dispositivo que capturó la evidencia. |
| Formato de imagen | `mime_type` | text | No | — | CHECK (mime_type IN ('image/jpeg', 'image/png')) | 002 | En uso | Formato de la imagen: `image/jpeg` (JPEG) o `image/png` (PNG). |
| Huella SHA-256 | `content_hash` | char(64) | No | — | — | 002 | En uso | SHA-256 recalculado por el servidor a partir de los bytes. |
| Imagen | `content` | bytea | No | — | — | 002 | En uso | Bytes de la imagen. Puede mostrar personas o domicilios: dato personal. |
| Estado | `status` | text | No | — | CHECK (status = 'verified') | 002 | En uso | Estado de la evidencia: siempre `verified` (verificada). |
| Origen | `source` | text | No | 'PILOT_PROVISIONAL' | CHECK (source = 'PILOT_PROVISIONAL') | 002 | Control técnico | Origen de la fila. Hoy solo `PILOT_PROVISIONAL` (piloto provisional). |
| Fecha de verificación | `created_at` | timestamptz | No | now() | — | 002 | Control técnico | Momento de verificación del asset. |

## Legado de observaciones de pago (`payment_observations`)

Clave principal: Identificador de observación (`observation_id`). Columnas: 11.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Identificador de observación | `observation_id` | uuid | No | — | Clave principal | 003p | Legado de pagos | Identificador de la observación de pago. |
| Operación | `operation_id` | text | No | — | Única | 003p | Legado de pagos | Operación que originó la observación. Única. |
| Orden | `order_id` | uuid | No | — | Clave foránea → Órdenes de corte (`orders.order_id`) | 003p | Legado de pagos | Orden relacionada. |
| Cuenta | `account_id` | text | No | — | — | 003p | Legado de pagos | Cuenta observada. |
| Suministro | `supply_id` | text | No | — | — | 003p | Legado de pagos | Suministro observado. |
| Usuario | `actor_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 003p | Legado de pagos | Usuario que registró la observación. |
| Rol del usuario | `actor_role` | text | No | — | CHECK (actor_role IN ('ADMIN', 'TECHNICIAN')) | 003p | Legado de pagos | Rol del usuario que registró la observación: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |
| Dispositivo | `device_id` | text | No | — | — | 003p | Legado de pagos | Dispositivo que registró la observación. |
| Origen | `source` | text | No | — | CHECK (source = 'PILOT_PROVISIONAL') | 003p | Legado de pagos | Origen. Solo `PILOT_PROVISIONAL`. |
| Fecha de observación | `observed_at` | timestamptz | No | — | — | 003p | Legado de pagos | Momento de la observación. |
| Fecha de registro | `created_at` | timestamptz | No | now() | — | 003p | Legado de pagos | Momento de registro. |

## Roles concedidos (`user_role_grants`)

Clave principal: Usuario (`user_id`) + Rol concedido (`role`). Columnas: 2.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Usuario | `user_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`), borrado en cascada | 007g | En uso | Usuario con el rol concedido. |
| Rol concedido | `role` | text | No | — | CHECK (role IN ('ADMIN', 'TECHNICIAN')) | 007g | En uso | Rol concedido: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |

## Versiones del paquete de trabajo (`work_package_versions`)

Clave principal: Técnico (`technician_id`) + Dispositivo (`device_id`). Columnas: 4.

| Nombre en español | Nombre técnico | Tipo | Nulo | Defecto | Restricciones | Migración | Clasificación | Descripción |
|---|---|---|---|---|---|---|---|---|
| Técnico | `technician_id` | uuid | No | — | Clave foránea → Usuarios (`users.user_id`) | 007w | En uso | Técnico del paquete. |
| Dispositivo | `device_id` | text | No | — | — | 007w | En uso | Dispositivo del paquete. |
| Última versión entregada | `last_version` | bigint | No | — | CHECK (last_version >= 0) | 007w | En uso | Última versión de paquete entregada a ese técnico y dispositivo. |
| Última actualización | `updated_at` | timestamptz | No | now() | — | 007w | Control técnico | Último cambio de la versión. |

## Discrepancias y redefiniciones

`003_reference_fields.sql` añade columnas que `001_init.sql` ya define, con `ADD COLUMN IF NOT EXISTS`. Su comentario dice que está pensado para bases creadas antes de extender `001_init.sql`. En una base creada con 001, esas líneas no cambian nada; en una base anterior, sí. La tabla muestra las dos definiciones para que se pueda comprobar cuál rige en la base desplegada.

| Tabla | Columna | Primera definición (migración · tipo) | Redefinición (migración · tipo) |
|---|---|---|---|
| Morosos y suministros (`debtors`) | Circuito (`circuit`) | 001_init.sql · text NOT NULL DEFAULT '' | 003_reference_fields.sql · text NOT NULL DEFAULT 'TODO: VALIDAR CON SEPSA' |
| Morosos y suministros (`debtors`) | Documento de identidad del cliente (`customer_ci`) | 001_init.sql · text | 003_reference_fields.sql · text |
| Morosos y suministros (`debtors`) | Teléfono de contacto (`contact_phone`) | 001_init.sql · text | 003_reference_fields.sql · text |
| Morosos y suministros (`debtors`) | Tarifa (`tariff`) | 001_init.sql · text NOT NULL DEFAULT '' | 003_reference_fields.sql · text NOT NULL DEFAULT 'TODO: VALIDAR CON SEPSA' |
| Morosos y suministros (`debtors`) | Estado del suministro (`supply_status`) | 001_init.sql · text NOT NULL DEFAULT '' | 003_reference_fields.sql · text NOT NULL DEFAULT 'TODO: VALIDAR CON SEPSA' |
| Morosos y suministros (`debtors`) | Título de habilitación (`enabling_title`) | 001_init.sql · text | 003_reference_fields.sql · text |
| Morosos y suministros (`debtors`) | Orden de recorrido (`route_order`) | 001_init.sql · integer | 003_reference_fields.sql · integer |
| Morosos y suministros (`debtors`) | Latitud catastral (`cadastral_latitude`) | 001_init.sql · numeric | 003_reference_fields.sql · numeric(9,6) |
| Morosos y suministros (`debtors`) | Longitud catastral (`cadastral_longitude`) | 001_init.sql · numeric | 003_reference_fields.sql · numeric(9,6) |
| Morosos y suministros (`debtors`) | Marca del medidor (`meter_brand`) | 001_init.sql · text | 003_reference_fields.sql · text |
| Morosos y suministros (`debtors`) | Índice del medidor (`meter_index`) | 001_init.sql · text | 003_reference_fields.sql · text |
| Morosos y suministros (`debtors`) | Multiplicador del medidor (`meter_multiplier`) | 001_init.sql · integer | 003_reference_fields.sql · numeric(12,4) |
| Morosos y suministros (`debtors`) | Reclamos (`claims`) | 001_init.sql · boolean | 003_reference_fields.sql · boolean |
| Morosos y suministros (`debtors`) | Plan de pagos (`payment_plan`) | 001_init.sql · boolean | 003_reference_fields.sql · boolean |
| Morosos y suministros (`debtors`) | Fecha de suspensión (`suspension_date`) | 001_init.sql · timestamptz | 003_reference_fields.sql · timestamptz |
| Morosos y suministros (`debtors`) | Reconexión manual (`reconnection_manual`) | 001_init.sql · boolean | 003_reference_fields.sql · boolean |
| Morosos y suministros (`debtors`) | Fecha de reconexión (histórica) (`reconnection_date`) | 001_init.sql · timestamptz | 003_reference_fields.sql · timestamptz |
| Morosos y suministros (`debtors`) | Técnico de reconexión (histórico) (`reconnection_technician`) | 001_init.sql · text | 003_reference_fields.sql · text |
| Órdenes de corte (`orders`) | Código CUC (`cuc`) | 001_init.sql · text UNIQUE | 001_init.sql · text |
| Órdenes de corte (`orders`) | Código CUC (`cuc`) | 001_init.sql · text UNIQUE | 003_reference_fields.sql · text |

Restricciones cambiadas después de crear la tabla (migración 008):

- `orders.status`: 001 aceptaba `GENERADO`, `EJECUTADO` y `ANULADO`. 008 añade `RECONEXIÓN`.
- `sync_operations.action`: 001 aceptaba `CUT` y `VISIT`. 008 añade `RECONNECTION`.
- `cut_authorizations.action`: columna nueva en 008, con valores `CUT` y `RECONNECTION`.

Otras diferencias observadas:

- `orders.cuc` tiene tres definiciones de unicidad: `UNIQUE` en la creación de la tabla (001), el índice `orders_cuc_idx` (001) y el índice `orders_cuc_unique` (003_reference_fields). Son redundantes: no cambian el comportamiento, pero hay que conocerlas al revisar la base.
- `debtors.circuit`, `tariff` y `supply_status` tienen defecto `''` en 001 y `'TODO: VALIDAR CON SEPSA'` en 003_reference_fields.
- La migración 003_reference_fields no se lista en el arranque del backend (`docs/operations/pilot-runbook.md`). La decisión de aplicarla o no corresponde a la base desplegada.

Estas diferencias son técnicas. No se resuelven aquí; se verifican en la base desplegada con `\d` de cada tabla antes de presentar el diccionario como definitivo.

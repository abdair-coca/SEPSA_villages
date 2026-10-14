# 05. Diccionario de datos

Fuente: migraciones `backend/sql/001` a `008`, leídas en modo de solo lectura.
Fecha: 2026-10-13
Estado: entrega, copia fechada. La base desplegada puede diferir del esquema de las migraciones (ver la última sección).

13 tablas y 147 columnas. Cada columna va con su nombre en español y, entre paréntesis, su nombre técnico. **Los nombres técnicos no se cambian**: son los que se buscan en la base y en el código. Las etiquetas entre corchetes marcan columnas sin uso operativo: `[Provisional]` y `[Histórica]` vienen de cargas de datos; `[Legado de pagos]` no tiene comportamiento en el piloto; `[Legado de reconexión]` no sustituye el registro por operación. Cuando la descripción solo repite el nombre, se omite.

## Valores de estado

| Campo | Valores | Significado |
|---|---|---|
| Orden | `GENERADO`, `EJECUTADO`, `RECONEXIÓN`, `ANULADO` | Generada, cortada, reconectada, anulada (el piloto no anula) |
| Estado físico | `NONE`, `CLAIMED`, `CONFIRMED`, `PHYSICAL_UNKNOWN` | Sin reclamación; intención guardada en el dispositivo; confirmado; incierto (no se repite) |
| Autorización | `RESERVED`, `CONSUMED`, `EXPIRED`, `REJECTED` | Reservada; consumida; vencida; rechazada |
| Operación | `pending`, `acknowledged`, `conflict` | Pendiente; confirmada por el servidor; en conflicto |
| Tipo | `CUT`, `VISIT`, `RECONNECTION` | Corte; visita; reconexión |
| Rol | `ADMIN`, `TECHNICIAN` | Administrador; técnico |
| Origen | `PILOT_PROVISIONAL` | Piloto provisional, no dato oficial de SEPSA |

## Tablas

Clave de cada tabla: `users`, `sessions`, `debtors`, `orders`, `order_assignments`, `command_operations`, `cut_authorizations`, `sync_operations`, `audit_events`, `evidence_assets`, `payment_observations` y `work_package_versions` (técnico + dispositivo) tienen su clave en la primera columna; `user_role_grants` tiene como clave usuario + rol concedido.

### Usuarios (`users`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de usuario (`user_id`) | uuid; clave principal | |
| Nombre de acceso (`username`) | text; única | |
| Nombre visible (`display_name`) | text | Nombre en la interfaz y en los registros |
| Rol inicial (`role`) | text; CHECK `ADMIN`, `TECHNICIAN` | |
| Hash de la contraseña (`password_hash`) | text | Hash scrypt |
| Cuenta activa (`enabled`) | boolean; DEFAULT true | Si puede iniciar sesión |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | |

### Sesiones (`sessions`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de sesión (`session_id`) | uuid; clave principal | |
| Usuario (`user_id`) | uuid; FK → `users.user_id` | |
| Huella del token (`token_hash`) | char(64); única | Hash del token de sesión |
| Fecha de vencimiento (`expires_at`) | timestamptz | |
| Fecha de cierre (`revoked_at`) | timestamptz; opcional | |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | |
| Rol activo (`active_role`) | text; opcional; CHECK `ADMIN`, `TECHNICIAN` | |

### Morosos y suministros (`debtors`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador del moroso (`debtor_id`) | text; clave principal | Identificador interno del registro |
| Cuenta (`account_id`) | text; única | [Provisional] `CODIGO` del Excel |
| Suministro (`supply_id`) | text; única | [Provisional] |
| Nombre del cliente (`customer_name`) | text | [Provisional] `NOMBRE` del Excel |
| Dirección (`address`) | text | [Provisional] `DIRECCION` del Excel |
| Referencias de la dirección (`reference_text`) | text; DEFAULT '' | [Provisional] |
| Medidor (`meter_id`) | text | [Provisional] normalizado desde `MEDIDOR` |
| Área (`area`) | text | [Provisional] `AREA COD` |
| Localidad (`locality`) | text | [Provisional] `LOC COD` y `LOCALIDAD`, por ejemplo `078 - COA COA` |
| Ruta (`route`) | text | [Provisional] |
| Deuda en centavos (`debt_cents`) | integer; CHECK ≥ 0 | Deuda total en centavos enteros |
| Meses pendientes (`months_pending`) | integer; CHECK ≥ 0 | |
| Historial de movimientos (kardex) (`kardex`) | jsonb; DEFAULT `'[]'` | |
| Contexto (`context`) | jsonb; DEFAULT `'{}'` | |
| Última actualización (`updated_at`) | timestamptz; opcional | |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Circuito (`circuit`) | text; DEFAULT '' | [Histórica] |
| Documento de identidad del cliente (`customer_ci`) | text; opcional | [Histórica] |
| Teléfono de contacto (`contact_phone`) | text; opcional | [Histórica] |
| Tarifa (`tariff`) | text; DEFAULT '' | [Histórica] |
| Estado del suministro (`supply_status`) | text; DEFAULT '' | [Histórica] |
| Título de habilitación (`enabling_title`) | text; opcional | [Histórica] |
| Orden de recorrido (`route_order`) | integer; opcional | [Histórica] dentro de la ruta |
| Latitud catastral (`cadastral_latitude`) | numeric; opcional | [Histórica] |
| Longitud catastral (`cadastral_longitude`) | numeric; opcional | [Histórica] |
| Marca del medidor (`meter_brand`) | text; opcional | [Provisional] si viene en `MEDIDOR` |
| Índice del medidor (`meter_index`) | text; opcional | [Histórica] |
| Multiplicador del medidor (`meter_multiplier`) | integer; opcional | [Histórica] |
| Reclamos (`claims`) | boolean; opcional | [Histórica] |
| Plan de pagos (`payment_plan`) | boolean; opcional | [Legado de pagos] |
| Fecha de suspensión (`suspension_date`) | timestamptz; opcional | [Histórica] |
| Reconexión manual (`reconnection_manual`) | boolean; opcional | [Histórica] |
| Fecha de reconexión histórica (`reconnection_date`) | timestamptz; opcional | [Legado de reconexión] |
| Técnico de reconexión histórico (`reconnection_technician`) | text; opcional | [Legado de reconexión] |

### Órdenes de corte (`orders`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de orden (`order_id`) | uuid; clave principal | |
| Código CUC (`cuc`) | text; opcional; única | Prefijo `CUC-`, generado por el backend al crear la orden |
| Moroso (`debtor_id`) | text; FK → `debtors.debtor_id` | Suministro al que se refiere la orden |
| Propósito (`purpose`) | text; CHECK `CUT` | |
| Estado de la orden (`status`) | text; CHECK `GENERADO`, `EJECUTADO`, `ANULADO` | `RECONEXIÓN` se añade en 008 |
| Estado físico (`physical_status`) | text; CHECK `NONE`, `CLAIMED`, `CONFIRMED`, `PHYSICAL_UNKNOWN` | Ver valores de estado |
| Versión (`version`) | integer; CHECK > 0 | |
| Creada por (`created_by`) | uuid; FK → `users.user_id` | Administrador que la creó |
| Técnico asignado (`assigned_technician_id`) | uuid; opcional; FK → `users.user_id` | Técnico asignado actualmente |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | |
| Última actualización (`updated_at`) | timestamptz; DEFAULT now() | |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |

### Asignaciones de órdenes (`order_assignments`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de asignación (`assignment_id`) | uuid; clave principal | |
| Orden (`order_id`) | uuid; FK → `orders.order_id` | |
| Técnico (`technician_id`) | uuid; FK → `users.user_id` | |
| Técnico anterior (`from_technician_id`) | uuid; opcional; FK → `users.user_id` | Si la orden se reasignó |
| Asignada por (`assigned_by`) | uuid; FK → `users.user_id` | Administrador |
| Versión (`version`) | integer | Versión de la orden tras la asignación |
| Fecha de asignación (`assigned_at`) | timestamptz; DEFAULT now() | |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |

### Operaciones de comando (`command_operations`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de operación (`operation_id`) | text; clave principal | Identificador único del comando |
| Tipo de comando (`operation_type`) | text | |
| Usuario que ejecutó (`actor_id`) | uuid; FK → `users.user_id` | |
| Huella de la petición (`request_hash`) | char(64) | Hash del contenido de la petición |
| Estado (`status`) | text; CHECK `pending`, `completed` | |
| Respuesta guardada (`response`) | jsonb; opcional | Para devolver el mismo resultado en un replay |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | |

### Autorizaciones de corte (`cut_authorizations`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de autorización (`authorization_id`) | uuid; clave principal | |
| Identificador de operación (`operation_id`) | text; única | Operación que reservó la autorización |
| Orden (`order_id`) | uuid; FK → `orders.order_id` | |
| Técnico (`technician_id`) | uuid; FK → `users.user_id` | |
| Dispositivo (`device_id`) | text | |
| Versión de la orden (`order_version`) | integer | Versión fijada por la autorización |
| Huella del token (`token_hash`) | char(64); única | Token de un solo uso |
| Estado (`status`) | text; CHECK `RESERVED`, `CONSUMED`, `EXPIRED`, `REJECTED` | |
| Fecha de vencimiento (`expires_at`) | timestamptz | Vencimiento de la reserva |
| Fecha de consumo (`consumed_at`) | timestamptz; opcional | |
| Operación que la consumió (`consumed_operation_id`) | text; opcional | |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Fecha de reserva (`created_at`) | timestamptz; DEFAULT now() | |
| Tipo de habilitación (`action`) | text; DEFAULT `CUT` | `CUT` o `RECONNECTION`, desde 008 |
| Nombre del técnico histórico (`technician_name_snapshot`) | text; opcional | Nombre en el momento de la reconexión |

### Operaciones de sincronización (`sync_operations`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de operación (`operation_id`) | text; clave principal | |
| Técnico (`technician_id`) | uuid; FK → `users.user_id` | |
| Dispositivo (`device_id`) | text | |
| Orden (`order_id`) | uuid; FK → `orders.order_id` | |
| Tipo de operación (`action`) | text; CHECK `CUT`, `VISIT` | `RECONNECTION` desde 008 |
| Contenido (`payload`) | jsonb | Contenido completo de la operación |
| Huella del contenido (`payload_hash`) | char(64) | |
| Estado (`status`) | text; CHECK `pending`, `acknowledged`, `conflict` | |
| Motivo del conflicto (`conflict_reason`) | text; opcional | |
| Fecha de confirmación (`acknowledged_at`) | timestamptz; opcional | ACK del backend |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Fecha de recepción (`created_at`) | timestamptz; DEFAULT now() | |

### Eventos de auditoría (`audit_events`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador del evento (`audit_id`) | uuid; clave principal | |
| Usuario (`actor_id`) | uuid; FK → `users.user_id` | |
| Rol del usuario (`actor_role`) | text; opcional; CHECK `ADMIN`, `TECHNICIAN` | Rol activo al ejecutar la acción |
| Acción (`action`) | text | |
| Entidad afectada (`entity_id`) | text; opcional | |
| Orden (`order_id`) | uuid; opcional; FK → `orders.order_id` | |
| Operación (`operation_id`) | text; opcional | |
| Resultado (`result`) | text; CHECK `accepted`, `rejected` | |
| Motivo (`reason`) | text; opcional | |
| Dispositivo (`device_id`) | text; opcional | |
| Cambio de estado (`transition`) | jsonb; opcional | |
| Datos adicionales (`metadata`) | jsonb; opcional | |
| Fecha del evento (`occurred_at`) | timestamptz; DEFAULT now() | |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |

### Evidencias fotográficas (`evidence_assets`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de evidencia (`evidence_id`) | text; clave principal | |
| Orden (`order_id`) | uuid; FK → `orders.order_id` | |
| Operación (`operation_id`) | text | |
| Técnico (`technician_id`) | uuid; FK → `users.user_id` | Quien capturó la evidencia |
| Dispositivo (`device_id`) | text | |
| Formato de imagen (`mime_type`) | text; CHECK `image/jpeg`, `image/png` | |
| Huella SHA-256 (`content_hash`) | char(64) | Recalculada por el servidor a partir de los bytes |
| Imagen (`content`) | bytea | Bytes de la imagen |
| Estado (`status`) | text; CHECK `verified` | Siempre `verified` |
| Origen (`source`) | text; DEFAULT `PILOT_PROVISIONAL`; CHECK | |
| Fecha de verificación (`created_at`) | timestamptz; DEFAULT now() | |

### Legado de observaciones de pago (`payment_observations`)

Todas las columnas son [Legado de pagos].

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de observación (`observation_id`) | uuid; clave principal | |
| Operación (`operation_id`) | text; única | Operación que originó la observación |
| Orden (`order_id`) | uuid; FK → `orders.order_id` | |
| Cuenta (`account_id`) | text | Cuenta observada |
| Suministro (`supply_id`) | text | Suministro observado |
| Usuario (`actor_id`) | uuid; FK → `users.user_id` | Quien registró la observación |
| Rol del usuario (`actor_role`) | text; CHECK `ADMIN`, `TECHNICIAN` | |
| Dispositivo (`device_id`) | text | |
| Origen (`source`) | text; CHECK `PILOT_PROVISIONAL` | |
| Fecha de observación (`observed_at`) | timestamptz | |
| Fecha de registro (`created_at`) | timestamptz; DEFAULT now() | |

### Roles concedidos (`user_role_grants`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Usuario (`user_id`) | uuid; FK → `users.user_id`, borrado en cascada | Clave junto con el rol |
| Rol concedido (`role`) | text; CHECK `ADMIN`, `TECHNICIAN` | |

### Versiones del paquete de trabajo (`work_package_versions`)

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Técnico (`technician_id`) | uuid; FK → `users.user_id` | Clave junto con el dispositivo |
| Dispositivo (`device_id`) | text | |
| Última versión entregada (`last_version`) | bigint; CHECK ≥ 0 | Para ese técnico y dispositivo |
| Última actualización (`updated_at`) | timestamptz; DEFAULT now() | |

## Diferencias entre migraciones

- `003_reference_fields.sql` redefine columnas de `debtors` que `001_init.sql` ya crea (con `ADD COLUMN IF NOT EXISTS`). En una base creada con `001` no cambia nada; en una base anterior, sí. Las columnas afectadas son `circuit`, `tariff` y `supply_status` (con un valor provisional pendiente de SEPSA en `003`), además de `cadastral_latitude` y `cadastral_longitude` (`numeric(9,6)`), `meter_multiplier` (`numeric(12,4)`), `claims`, `payment_plan`, `suspension_date`, `reconnection_manual`, `reconnection_date`, `reconnection_technician`, `route_order` y varias más.
- `orders.cuc` tiene tres definiciones de unicidad (la restricción de creación y dos índices). Son redundantes; no cambian el comportamiento.
- `008_reconnection_schema.sql` amplía tres restricciones: `orders.status` agrega `RECONEXIÓN`; `sync_operations.action` agrega `RECONNECTION`; `cut_authorizations.action` es una columna nueva con `CUT` y `RECONNECTION`.
- `003_reference_fields.sql` no está en el arranque del servidor. Qué migraciones aplicar a la base desplegada lo decide el equipo.

Estas diferencias son técnicas. Antes de presentar el diccionario como definitivo, hay que confirmar la base desplegada con la descripción de cada tabla en PostgreSQL.

# 05. Diccionario de datos

Fuente: migraciones `backend/sql/001` a `008`, leídas en modo de solo lectura.
Fecha: 2026-10-13
Estado: entrega, copia fechada. La base desplegada puede diferir del esquema del repo (ver la última sección).

13 tablas y 147 columnas. Cada columna va con su nombre en español y, entre paréntesis, su nombre técnico. **Los nombres técnicos no se cambian**: son los que se buscan en la base y en el código. Las etiquetas entre corchetes marcan columnas que no tienen uso operativo: `[Provisional]` y `[Histórica]` vienen de cargas de datos; `[Legado de pagos]` no tiene comportamiento en el piloto; `[Legado de reconexión]` no sustituye el registro por operación.

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

### Usuarios (`users`)
Clave: Identificador de usuario (`user_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de usuario (`user_id`) | uuid; Clave principal | Identificador de la cuenta. |
| Nombre de acceso (`username`) | text; Única | Nombre de acceso. |
| Nombre visible (`display_name`) | text | Nombre visible en la interfaz y en los registros. |
| Rol inicial (`role`) | text; CHECK (role IN ('ADMIN', 'TECHNICIAN')) | Rol inicial de la cuenta: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |
| Hash de la contraseña (`password_hash`) | text | Hash scrypt de la contraseña. |
| Cuenta activa (`enabled`) | boolean; DEFAULT true | Indica si la cuenta puede iniciar sesión. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | Momento de creación de la cuenta. |

### Sesiones (`sessions`)
Clave: Identificador de sesión (`session_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de sesión (`session_id`) | uuid; Clave principal | Identificador de la sesión. |
| Usuario (`user_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Usuario de la sesión. |
| Huella del token (`token_hash`) | char(64); Única | Hash de 64 caracteres del token de sesión. |
| Fecha de vencimiento (`expires_at`) | timestamptz | Vencimiento de la sesión. |
| Fecha de cierre (`revoked_at`) | timestamptz; Opcional | Momento de cierre de la sesión. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | Momento de creación de la sesión. |
| Rol activo (`active_role`) | text; Opcional; CHECK (active_role IN ('ADMIN', 'TECHNICIAN')) | Rol activo de la sesión: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |

### Morosos y suministros (`debtors`)
Clave: Identificador del moroso (`debtor_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador del moroso (`debtor_id`) | text; Clave principal | Identificador interno del registro de morosidad. |
| Cuenta (`account_id`) | text; Única | [Provisional] Cuenta (`CODIGO` del Excel). |
| Suministro (`supply_id`) | text; Única | [Provisional] Identificador del suministro. |
| Nombre del cliente (`customer_name`) | text | [Provisional] Nombre del cliente (`NOMBRE` del Excel). |
| Dirección (`address`) | text | [Provisional] Dirección del suministro (`DIRECCION` del Excel). |
| Referencias de la dirección (`reference_text`) | text; DEFAULT '' | [Provisional] Referencias complementarias de la dirección. |
| Medidor (`meter_id`) | text | [Provisional] Medidor, normalizado desde `MEDIDOR`. |
| Área (`area`) | text | [Provisional] Código de área (`AREA COD`). |
| Localidad (`locality`) | text | [Provisional] Código y nombre de localidad (`LOC COD` y `LOCALIDAD`), por ejemplo `078 - COA COA`. |
| Ruta (`route`) | text | [Provisional] Ruta. |
| Deuda en centavos (`debt_cents`) | integer; CHECK (debt_cents >= 0) | Deuda total en centavos enteros. |
| Meses pendientes (`months_pending`) | integer; CHECK (months_pending >= 0) | Meses con deuda pendiente. |
| Historial de movimientos (kardex) (`kardex`) | jsonb; DEFAULT '[]'::jsonb | Historial de movimientos de la cuenta en JSON. |
| Contexto (`context`) | jsonb; DEFAULT '{}'::jsonb | Contexto adicional en JSON. |
| Última actualización (`updated_at`) | timestamptz; Opcional | Última actualización del registro. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Circuito (`circuit`) | text; DEFAULT '' | [Histórica] Circuito del suministro, de la carga histórica. |
| Documento de identidad del cliente (`customer_ci`) | text; Opcional | [Histórica] Documento de identidad del cliente. |
| Teléfono de contacto (`contact_phone`) | text; Opcional | [Histórica] Teléfono de contacto. |
| Tarifa (`tariff`) | text; DEFAULT '' | [Histórica] Tarifa, de la carga histórica. |
| Estado del suministro (`supply_status`) | text; DEFAULT '' | [Histórica] Estado del suministro, de la carga histórica. |
| Título de habilitación (`enabling_title`) | text; Opcional | [Histórica] Título de habilitación de la carga histórica. |
| Orden de recorrido (`route_order`) | integer; Opcional | [Histórica] Orden de recorrido dentro de la ruta, de la carga histórica. |
| Latitud catastral (`cadastral_latitude`) | numeric; Opcional | [Histórica] Latitud catastral, de la carga histórica. |
| Longitud catastral (`cadastral_longitude`) | numeric; Opcional | [Histórica] Longitud catastral, de la carga histórica. |
| Marca del medidor (`meter_brand`) | text; Opcional | [Provisional] Marca del medidor, si viene indicada en la carga (`MEDIDOR`). |
| Índice del medidor (`meter_index`) | text; Opcional | [Histórica] Índice del medidor, de la carga histórica. |
| Multiplicador del medidor (`meter_multiplier`) | integer; Opcional | [Histórica] Multiplicador del medidor, de la carga histórica. |
| Reclamos (`claims`) | boolean; Opcional | [Histórica] Indicador de reclamos de la carga histórica. |
| Plan de pagos (`payment_plan`) | boolean; Opcional | [Legado de pagos] Indicador de plan de pagos. |
| Fecha de suspensión (`suspension_date`) | timestamptz; Opcional | [Histórica] Fecha de suspensión de la carga histórica. |
| Reconexión manual (`reconnection_manual`) | boolean; Opcional | [Histórica] Indicador de reconexión manual de la carga histórica. |
| Fecha de reconexión (histórica) (`reconnection_date`) | timestamptz; Opcional | [Legado de reconexión] Fecha de reconexión histórica. |
| Técnico de reconexión (histórico) (`reconnection_technician`) | text; Opcional | [Legado de reconexión] Técnico de la reconexión histórica. |

### Órdenes de corte (`orders`)
Clave: Identificador de orden (`order_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de orden (`order_id`) | uuid; Clave principal | Identificador de la orden. |
| Código CUC (`cuc`) | text; Opcional; Única | Identificador de la orden con prefijo `CUC-`, generado por el backend al crear la orden. |
| Moroso (`debtor_id`) | text; Clave foránea → Morosos y suministros (`debtors.debtor_id`) | Suministro moroso al que se refiere la orden. |
| Propósito (`purpose`) | text; CHECK (purpose = 'CUT') | Propósito de la orden. |
| Estado de la orden (`status`) | text; CHECK (status IN ('GENERADO', 'EJECUTADO', 'ANULADO')) | Estado de la orden: `GENERADO` (generada), `EJECUTADO` (ejecutada), `ANULADO` (anulada) o `RECONEXIÓN` (en reconexión). |
| Estado físico (`physical_status`) | text; CHECK (physical_status IN ('NONE', 'CLAIMED', 'CONFIRMED', 'PHYSICAL_UNKNOWN')) | Estado físico: `NONE` (sin reclamación), `CLAIMED` (reclamado: intención guardada en el dispositivo), `CONFIRMED` (confirmado) o `PHYSICAL_UNKNOWN` (resultado incierto; requiere revisión humana). |
| Versión (`version`) | integer; CHECK (version > 0) | Versión de la orden. |
| Creada por (`created_by`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Administrador que creó la orden. |
| Técnico asignado (`assigned_technician_id`) | uuid; Opcional; Clave foránea → Usuarios (`users.user_id`) | Técnico asignado actualmente. |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | Momento de creación de la orden. |
| Última actualización (`updated_at`) | timestamptz; DEFAULT now() | Último cambio de la orden. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |

### Asignaciones de órdenes (`order_assignments`)
Clave: Identificador de asignación (`assignment_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de asignación (`assignment_id`) | uuid; Clave principal | Identificador de la asignación. |
| Orden (`order_id`) | uuid; Clave foránea → Órdenes de corte (`orders.order_id`) | Orden asignada. |
| Técnico (`technician_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Técnico al que se asigna la orden. |
| Técnico anterior (`from_technician_id`) | uuid; Opcional; Clave foránea → Usuarios (`users.user_id`) | Técnico anterior, si la orden se reasignó. |
| Asignada por (`assigned_by`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Administrador que hizo la asignación. |
| Versión (`version`) | integer | Versión de la orden tras la asignación. |
| Fecha de asignación (`assigned_at`) | timestamptz; DEFAULT now() | Momento de la asignación. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |

### Operaciones de comando (`command_operations`)
Clave: Identificador de operación (`operation_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de operación (`operation_id`) | text; Clave principal | Identificador único del comando. |
| Tipo de comando (`operation_type`) | text | Tipo de comando ejecutado. |
| Usuario que ejecutó (`actor_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Usuario que ejecutó el comando. |
| Huella de la petición (`request_hash`) | char(64) | Hash de 64 caracteres del contenido de la petición. |
| Estado (`status`) | text; CHECK (status IN ('pending', 'completed')) | `pending` (pendiente) o `completed` (completado). |
| Respuesta guardada (`response`) | jsonb; Opcional | Respuesta guardada para devolver el mismo resultado en un replay. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Fecha de creación (`created_at`) | timestamptz; DEFAULT now() | Momento de creación del comando. |

### Autorizaciones de corte (`cut_authorizations`)
Clave: Identificador de autorización (`authorization_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de autorización (`authorization_id`) | uuid; Clave principal | Identificador de la autorización. |
| Identificador de operación (`operation_id`) | text; Única | Operación que reservó la autorización. |
| Orden (`order_id`) | uuid; Clave foránea → Órdenes de corte (`orders.order_id`) | Orden autorizada. |
| Técnico (`technician_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Técnico autorizado. |
| Dispositivo (`device_id`) | text | Dispositivo que pidió la autorización. |
| Versión de la orden (`order_version`) | integer | Versión de la orden fijada por la autorización. |
| Huella del token (`token_hash`) | char(64); Única | Hash de 64 caracteres del token de un solo uso. |
| Estado (`status`) | text; CHECK (status IN ('RESERVED', 'CONSUMED', 'EXPIRED', 'REJECTED')) | `RESERVED` (reservada), `CONSUMED` (consumida), `EXPIRED` (vencida) o `REJECTED` (rechazada). |
| Fecha de vencimiento (`expires_at`) | timestamptz | Vencimiento de la reserva. |
| Fecha de consumo (`consumed_at`) | timestamptz; Opcional | Momento del consumo. |
| Operación que la consumió (`consumed_operation_id`) | text; Opcional | Operación que consumió la autorización. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Fecha de reserva (`created_at`) | timestamptz; DEFAULT now() | Momento de la reserva. |
| Tipo de habilitación (`action`) | text; DEFAULT 'CUT' | Tipo de habilitación: `CUT` (corte) o `RECONNECTION` (reconexión), desde la migración 008. |
| Nombre del técnico (histórico) (`technician_name_snapshot`) | text; Opcional | Nombre del técnico en el momento de la reconexión. |

### Operaciones de sincronización (`sync_operations`)
Clave: Identificador de operación (`operation_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de operación (`operation_id`) | text; Clave principal | Identificador de la operación enviada. |
| Técnico (`technician_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Técnico que envió la operación. |
| Dispositivo (`device_id`) | text | Dispositivo que envió la operación. |
| Orden (`order_id`) | uuid; Clave foránea → Órdenes de corte (`orders.order_id`) | Orden de la operación. |
| Tipo de operación (`action`) | text; CHECK (action IN ('CUT', 'VISIT')) | Tipo de operación: `CUT` (corte) y `VISIT` (visita), desde 001; `RECONNECTION` (reconexión), desde 008. |
| Contenido (`payload`) | jsonb | Contenido completo de la operación en JSON. |
| Huella del contenido (`payload_hash`) | char(64) | Hash del payload. |
| Estado (`status`) | text; CHECK (status IN ('pending', 'acknowledged', 'conflict')) | `pending` (pendiente), `acknowledged` (confirmada por el servidor) o `conflict` (en conflicto). |
| Motivo del conflicto (`conflict_reason`) | text; Opcional | Motivo del conflicto, si lo hay. |
| Fecha de confirmación (`acknowledged_at`) | timestamptz; Opcional | Momento del ACK del backend. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Fecha de recepción (`created_at`) | timestamptz; DEFAULT now() | Momento de recepción de la operación. |

### Eventos de auditoría (`audit_events`)
Clave: Identificador del evento (`audit_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador del evento (`audit_id`) | uuid; Clave principal | Identificador del evento de auditoría. |
| Usuario (`actor_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Usuario que realizó la acción. |
| Rol del usuario (`actor_role`) | text; Opcional; CHECK (actor_role IN ('ADMIN', 'TECHNICIAN')) | Rol activo al ejecutar la acción: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |
| Acción (`action`) | text | Acción registrada. |
| Entidad afectada (`entity_id`) | text; Opcional | Identificador de la entidad afectada. |
| Orden (`order_id`) | uuid; Opcional; Clave foránea → Órdenes de corte (`orders.order_id`) | Orden relacionada, si la hay. |
| Operación (`operation_id`) | text; Opcional | Operación relacionada, si la hay. |
| Resultado (`result`) | text; CHECK (result IN ('accepted', 'rejected')) | `accepted` (aceptada) o `rejected` (rechazada). |
| Motivo (`reason`) | text; Opcional | Motivo. |
| Dispositivo (`device_id`) | text; Opcional | Dispositivo que originó la acción. |
| Cambio de estado (`transition`) | jsonb; Opcional | Cambio de estado registrado, en JSON. |
| Datos adicionales (`metadata`) | jsonb; Opcional | Datos adicionales de la acción, en JSON. |
| Fecha del evento (`occurred_at`) | timestamptz; DEFAULT now() | Momento del evento. |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |

### Evidencias fotográficas (`evidence_assets`)
Clave: Identificador de evidencia (`evidence_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de evidencia (`evidence_id`) | text; Clave principal | Identificador de la evidencia. |
| Orden (`order_id`) | uuid; Clave foránea → Órdenes de corte (`orders.order_id`) | Orden a la que pertenece la evidencia. |
| Operación (`operation_id`) | text | Operación a la que pertenece la evidencia. |
| Técnico (`technician_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Técnico que capturó la evidencia. |
| Dispositivo (`device_id`) | text | Dispositivo que capturó la evidencia. |
| Formato de imagen (`mime_type`) | text; CHECK (mime_type IN ('image/jpeg', 'image/png')) | Formato de la imagen: `image/jpeg` (JPEG) o `image/png` (PNG). |
| Huella SHA-256 (`content_hash`) | char(64) | SHA-256 recalculado por el servidor a partir de los bytes. |
| Imagen (`content`) | bytea | Bytes de la imagen. |
| Estado (`status`) | text; CHECK (status = 'verified') | Estado de la evidencia: siempre `verified` (verificada). |
| Origen (`source`) | text; DEFAULT 'PILOT_PROVISIONAL'; CHECK (source = 'PILOT_PROVISIONAL') | Origen de la fila. |
| Fecha de verificación (`created_at`) | timestamptz; DEFAULT now() | Momento de verificación del asset. |

### Legado de observaciones de pago (`payment_observations`)
Clave: Identificador de observación (`observation_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Identificador de observación (`observation_id`) | uuid; Clave principal | [Legado de pagos] Identificador de la observación de pago. |
| Operación (`operation_id`) | text; Única | [Legado de pagos] Operación que originó la observación. |
| Orden (`order_id`) | uuid; Clave foránea → Órdenes de corte (`orders.order_id`) | [Legado de pagos] Orden relacionada. |
| Cuenta (`account_id`) | text | [Legado de pagos] Cuenta observada. |
| Suministro (`supply_id`) | text | [Legado de pagos] Suministro observado. |
| Usuario (`actor_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | [Legado de pagos] Usuario que registró la observación. |
| Rol del usuario (`actor_role`) | text; CHECK (actor_role IN ('ADMIN', 'TECHNICIAN')) | [Legado de pagos] Rol del usuario que registró la observación: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |
| Dispositivo (`device_id`) | text | [Legado de pagos] Dispositivo que registró la observación. |
| Origen (`source`) | text; CHECK (source = 'PILOT_PROVISIONAL') | [Legado de pagos] Origen. |
| Fecha de observación (`observed_at`) | timestamptz | [Legado de pagos] Momento de la observación. |
| Fecha de registro (`created_at`) | timestamptz; DEFAULT now() | [Legado de pagos] Momento de registro. |

### Roles concedidos (`user_role_grants`)
Clave: Usuario (`user_id`) + Rol concedido (`role`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Usuario (`user_id`) | uuid; Clave foránea → Usuarios (`users.user_id`), borrado en cascada | Usuario con el rol concedido. |
| Rol concedido (`role`) | text; CHECK (role IN ('ADMIN', 'TECHNICIAN')) | Rol concedido: `ADMIN` (administrador) o `TECHNICIAN` (técnico). |

### Versiones del paquete de trabajo (`work_package_versions`)
Clave: Técnico (`technician_id`) + Dispositivo (`device_id`).

| Campo | Tipo y restricción | Descripción |
|---|---|---|
| Técnico (`technician_id`) | uuid; Clave foránea → Usuarios (`users.user_id`) | Técnico del paquete. |
| Dispositivo (`device_id`) | text | Dispositivo del paquete. |
| Última versión entregada (`last_version`) | bigint; CHECK (last_version >= 0) | Última versión de paquete entregada a ese técnico y dispositivo. |
| Última actualización (`updated_at`) | timestamptz; DEFAULT now() | Último cambio de la versión. |

## Diferencias entre migraciones

- `003_reference_fields.sql` redefine columnas de `debtors` que `001_init.sql` ya crea (con `ADD COLUMN IF NOT EXISTS`). En una base creada con `001` no cambia nada. En una base anterior, sí. Las columnas afectadas son `circuit`, `tariff` y `supply_status` (con defecto `'TODO: VALIDAR CON SEPSA'` en `003`), y además `cadastral_latitude` y `cadastral_longitude` (`numeric(9,6)`), `meter_multiplier` (`numeric(12,4)`), `claims`, `payment_plan`, `suspension_date`, `reconnection_manual`, `reconnection_date`, `reconnection_technician`, `route_order` y varias más.
- `orders.cuc` tiene tres definiciones de unicidad (la restricción de creación y dos índices). Son redundantes; no cambian el comportamiento.
- `008_reconnection_schema.sql` amplía tres restricciones: `orders.status` agrega `RECONEXIÓN`; `sync_operations.action` agrega `RECONNECTION`; `cut_authorizations.action` es una columna nueva con `CUT` y `RECONNECTION`.
- `003_reference_fields.sql` no está en el arranque del servidor. Qué migraciones aplicar a la base desplegada lo decide el equipo.

Estas diferencias son técnicas. Antes de presentar el diccionario como definitivo, hay que confirmar la base desplegada con la descripción de cada tabla en PostgreSQL.

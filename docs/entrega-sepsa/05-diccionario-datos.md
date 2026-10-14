# 05. Diccionario de datos

Fuente: migraciones `backend/sql/001` a `008`, leídas en modo de solo lectura.
Fecha: 2026-10-13
Estado: entrega, copia fechada. La base desplegada puede diferir del esquema del repo. Detalle columna por columna en el anexo A05.

El modelo tiene 13 tablas y 147 columnas. Los nombres técnicos no se cambian: son los que se buscan en la base y en el código.

| Tabla | Columnas | Para qué sirve |
|---|---|---|
| `users` | 8 | Cuentas |
| `sessions` | 8 | Sesiones activas |
| `debtors` | 34 | Morosos y suministros cargados; la mayoría [Provisional] o [Histórica] |
| `orders` | 12 | Órdenes de corte |
| `order_assignments` | 8 | Historial de asignación |
| `command_operations` | 8 | Operaciones de comando ejecutadas por un usuario |
| `cut_authorizations` | 15 | Autorizaciones de corte y reconexión, de un solo uso |
| `sync_operations` | 12 | Operaciones enviadas desde el dispositivo |
| `evidence_assets` | 11 | Fotos de evidencia y su huella SHA-256 |
| `audit_events` | 14 | Auditoría, solo de escritura adicional |
| `payment_observations` | 11 | Legado de pagos, sin uso operativo |
| `user_role_grants` | 2 | Roles concedidos |
| `work_package_versions` | 4 | Versión del paquete entregado a cada técnico y dispositivo |

Las etiquetas entre corchetes marcan columnas sin uso operativo: `[Provisional]` y `[Histórica]` vienen de cargas de datos; `[Legado de pagos]` no tiene comportamiento en el piloto; `[Legado de reconexión]` no sustituye el registro por operación.

Los valores permitidos de estado (orden, estado físico, autorización, operación, tipo, rol y origen) están en el anexo A05. Las diferencias entre migraciones (`003`, `008`) también están en ese anexo: son técnicas, y antes de dar el diccionario por definitivo hay que confirmar la base desplegada.

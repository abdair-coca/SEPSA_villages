# 13. Tratamiento de la información

Fuente: `docs/entrega-sepsa/04-modelo-datos.md` y `05-diccionario-datos.md` (tablas y columnas), `field-app/src/adapters/indexeddb/database.ts` (stores), `field-app/src/adapters/indexeddb/repository.ts` (borrados locales), `field-app/src/adapters/browser/session-persistence.ts`, `field-app/src/bootstrap/environment.ts`, `field-app/src/services/map-cache.ts`, `field-app/public/sw.js`, `field-app/src/App.tsx` (cierre de sesión), `backend/src/` (ausencia de borrados en servidor), `docs/api/pilot-contract.md`, `docs/entrega-sepsa/01-requisitos-funcionales-tecnicos.md` (RF-11, RF-16), `docs/DECISIONS.md` (D025, D026).
Fecha: 2026-10-13
Estado: entrega, copia fechada. Las fuentes activas mandan; si este documento y una fuente difieren, se corrige este documento (decisión D021 en `docs/DECISIONS.md`).

Este documento inventaria dónde están los datos del piloto, cuáles son personales, quién los custodia y qué borra realmente el sistema. Lo que el código no borra se indica como pendiente, no como garantía. La retención, la eliminación y la titularidad de los datos dependen de SEPSA y están marcadas como `TODO: VALIDAR CON SEPSA`.

## 1. Almacenes

| Almacén | Ubicación | Qué contiene | Datos personales | Borrado en el código |
|---|---|---|---|---|
| Base de datos del servidor | PostgreSQL del piloto (13 tablas, sección 2) | Usuarios, sesiones, morosos, órdenes, autorizaciones, operaciones, auditoría, evidencias | Sí (sección 4) | Ninguno. `backend/src/` no contiene sentencias `DELETE` ni `TRUNCATE` |
| IndexedDB de campo | Navegador del técnico, base `sepsa-field-app-<técnico>-<dispositivo>` (versión 3) | Paquete de trabajo, órdenes, operaciones, visitas, evidencias, cola, conflictos, borradores, historial físico (9 stores, sección 3) | Sí | Solo se borran órdenes (al llegar un paquete más nuevo, si no tienen estado físico y no están protegidas) y borradores (al registrar la visita). Ningún otro store tiene borrado en el código |
| IndexedDB de autoridad simulada | Navegador, base `sepsa-demo-authority` | Datos de demostración del modo simulado | Datos de demostración | Solo con `VITE_ENABLE_SIMULATION=true` o en desarrollo. No se usa en la aplicación conectada (D023) |
| `localStorage` | Navegador | Identidad de la sesión, nombre de usuario recordado, identificador de dispositivo (sección 3) | Sí (nombre de usuario e identidad) | Solo la sesión se borra al cerrar sesión |
| Cache Storage de la app | Navegador, prefijo `sepsa-field-shell-v3-` | Recursos de la aplicación (HTML, CSS, scripts) | No | Se reemplaza al actualizar la aplicación. Las rutas `/v1/*` y `/healthz` no se cachean (`field-app/public/sw.js`) |
| Cache Storage del mapa | Navegador, `sepsa-map-tiles-v1` | Teselas del mapa descargadas para las zonas de las órdenes | No directamente; revela la zona visible (sección 5) | No se borra al cerrar sesión |
| Registros del servidor | Salida estándar del proceso | Evento, resultado, código o estado HTTP e ID de petición | No, por diseño (contrato, "Seguridad HTTP y operación") | Depende del proveedor de hosting (pendiente, P-17) |
| Fotos de evidencia | Base de datos (`evidence_assets.content`) y IndexedDB (`evidence`) | Bytes de la imagen, que pueden mostrar personas o domicilios | Sí | Ver sección 6 |
| Repositorio de código | Historial de git y carpeta `backend/sql/seeds/` | Seeds 005 y 006 con filas de personas; el JSON de datos de prueba retirado en D026 sigue en el historial | Sí | Pendiente de decisión (P-27) |

## 2. Tablas de PostgreSQL

Estas son las 13 tablas de `04-modelo-datos.md`, con sus datos personales según `05-diccionario-datos.md`.

| Tabla | Datos personales o sensibles | Notas |
|---|---|---|
| `users` | Nombre de acceso (`username`), nombre visible (`display_name`), hash de contraseña (`password_hash`) | El hash es sensible; nunca se guarda en texto plano |
| `sessions` | Identidad del usuario y huella del token (`token_hash`) | El token no se guarda; expira a los 7 días (D025) |
| `debtors` | Nombre del cliente (`customer_name`), dirección (`address`), referencias de la dirección (`reference_text`), medidor (`meter_id`), documento de identidad (`customer_ci`), teléfono (`contact_phone`), coordenadas catastrales (`cadastral_latitude`, `cadastral_longitude`), deuda (`debt_cents`), meses pendientes (`months_pending`) y datos de suministro | Columnas históricas o provisionales según `05`. El umbral de deuda y la regla de bloqueo siguen pendientes (P-01) |
| `orders` | Vínculo con el moroso y técnico asignado | Estado operativo y físico de la orden |
| `order_assignments` | Técnico asignado y usuario que hizo la asignación | Historial de asignaciones |
| `command_operations` | Usuario y dispositivo que ejecutaron la operación | Operaciones de comando |
| `cut_authorizations` | Huella del token (`token_hash`), técnico y dispositivo | El token de un solo uso no se guarda en claro |
| `sync_operations` | Contenido completo de la operación en JSON (`payload`): lectura, ubicación GPS, observación de demora, nombre del técnico en ese momento | Se guarda para comparar reenvíos. Contiene ubicación del técnico y del suministro |
| `audit_events` | Usuario que actuó, dispositivo y datos adicionales en JSON (`metadata`) | Solo lectura para ADMIN |
| `evidence_assets` | Bytes de la imagen (`content`), huella SHA-256, técnico y dispositivo | Puede mostrar personas o domicilios (`05`) |
| `payment_observations` | Usuario y dispositivo que registraron la observación | Legado de pagos (`05`). No tiene comportamiento operativo (`RULES.md`) |
| `user_role_grants` | Usuario y rol concedido | Sin datos personales adicionales |
| `work_package_versions` | Técnico y dispositivo, con la versión del paquete | El paquete descargado contiene los datos de sus órdenes (sección 3) |

## 3. Almacenes de la aplicación de campo

### IndexedDB por técnico y dispositivo

La base se llama `sepsa-field-app-<técnico>-<dispositivo>`, con los identificadores codificados. Cada store guarda una entidad por su clave.

| Store | Clave | Contenido | Datos personales |
|---|---|---|---|
| `package` | `packageId` | Paquetes de trabajo descargados, con las órdenes del técnico (cliente, dirección, suministro, medidor, deuda y Kardex, según RF-11) | Sí |
| `orders` | `orderId` | Órdenes del paquete, con su versión local | Sí |
| `operations` | `operationId` | Registros de cortes y reconexiones | Sí (lectura, ubicación) |
| `visits` | `operationId` | Registros de visitas | Sí (observación, ubicación) |
| `evidence` | `evidenceId` | Fotos (bytes y huella) | Sí (puede mostrar personas o domicilios) |
| `sync` | `operationId` | Cola de sincronización, con el contenido de cada operación | Sí |
| `conflicts` | `conflictId` | Conflictos conservados para revisión | Sí |
| `drafts` | `draftId` | Borradores de captura (lectura, ubicación, excepciones) | Sí |
| `physicalTransitions` | — | Historial append-only de cambios de estado físico | Sí (ligado a orden y técnico) |

Por el diseño de la base, un técnico que usa dos dispositivos tiene dos bases distintas. El esquema no comparte datos entre ellas.

### `localStorage`

| Clave | Contenido | Borrado |
|---|---|---|
| `sepsa.authenticated-session` | Identidad de la sesión, rol y expiración. Nunca el token (`session-persistence.ts`) | Se borra al cerrar sesión y al leerse una sesión vencida |
| `sepsa.remembered-username` | Nombre de usuario, solo si el técnico marcó «recordar» | Se borra al desmarcar la opción |
| `sepsa.simulated.device-id` | Identificador estable del dispositivo, generado una vez (`environment.ts`) | No se borra |

La contraseña nunca se guarda en el navegador.

## 4. Datos personales

Cada dato personal tiene un almacén donde vive y una custodia técnica. El responsable del tratamiento lo define SEPSA (`TODO: VALIDAR CON SEPSA`, entrada P-24 en `14`). La custodia técnica la tiene quien administra la base de datos y el hosting del piloto; las fuentes activas no lo nombran (P-24).

| Dato personal | Dónde está | Custodia técnica | Estado |
|---|---|---|---|
| Nombre del cliente | `debtors.customer_name`; paquetes y órdenes en IndexedDB | Titular de la base y del hosting | Dato personal (`05`) |
| Dirección del suministro | `debtors.address`, `debtors.reference_text`; IndexedDB | Titular de la base y del hosting | Dato personal (`05`) |
| Documento de identidad del cliente | `debtors.customer_ci` | Titular de la base y del hosting | Dato personal (`05`); regla de bloqueo por CI pendiente (P-01) |
| Teléfono de contacto | `debtors.contact_phone` | Titular de la base y del hosting | Dato personal (`05`) |
| Medidor y su ubicación catastral | `debtors.meter_id`, `debtors.cadastral_latitude`, `debtors.cadastral_longitude` | Titular de la base y del hosting | La ubicación del suministro se trata como dato personal indirecto. Confirmar con SEPSA |
| Deuda y meses pendientes | `debtors.debt_cents`, `debtors.months_pending`; paquetes en IndexedDB | Titular de la base y del hosting | Dato personal indirecto. Umbrales pendientes (P-01) |
| Ubicación GPS del técnico en la captura | `sync_operations.payload`; `operations`, `visits` y `drafts` en IndexedDB | Titular de la base y del hosting | Dato personal indirecto. Umbrales de validación pendientes (P-02) |
| Fotos de evidencia | `evidence_assets.content`; `evidence` en IndexedDB | Titular de la base y del hosting | Dato personal (pueden mostrar personas o domicilios). Retención pendiente (P-14, P-15, P-18) |
| Nombre de usuario y nombre visible | `users.username`, `users.display_name`; `sepsa.remembered-username`; `sepsa.authenticated-session` | Titular de la base | Dato personal de empleados y técnicos |
| Hash de contraseña | `users.password_hash` | Titular de la base | Sensible. Nunca en texto plano |
| Nombre del técnico en el momento de la operación | `sync_operations.payload`; `technician_name_snapshot` (migración 008) | Titular de la base | Dato personal de técnicos: identidad histórica de la operación |

## 5. Envíos a terceros

- **Proveedor de teselas del mapa.** La aplicación pide las teselas a `server.arcgisonline.com`, con la plantilla de `field-app/src/services/map-cache.ts:9`. Cada petición revela el número de tesela (zoom, fila y columna), es decir, la zona del mapa que se visualiza. La plantilla de la URL solo contiene esos tres valores; no incluye datos de la sesión. El contrato con el proveedor y el aviso al técnico no están documentados en las fuentes activas (`TODO: VALIDAR CON SEPSA`, P-26).
- **Proveedores de base de datos y de hosting.** Las fuentes activas no nombran al proveedor de la base ni del servicio de la API. La topología, el proveedor y su región están pendientes (P-17).

## 6. Retención y eliminación

Ninguna regla de retención está confirmada: `TODO: VALIDAR CON SEPSA` (P-24, P-25, P-14, P-15 y P-18). Lo que sigue describe lo que el código hace hoy.

| Dato | Lo que hace el código | Pendiente |
|---|---|---|
| Sesiones vencidas en PostgreSQL | No se borran. El código no tiene sentencias `DELETE` | Retención de sesiones (P-24) |
| Usuarios deshabilitados | Se conservan; no se autentican | Retención y eliminación de cuentas (P-24) |
| Morosos y suministros | Se conservan. La importación no borra registros | Retención y eliminación de datos de morosos (P-24) |
| Auditoría | Se conserva; solo lectura para ADMIN | Retención de la auditoría (P-24) |
| Fotos de evidencia (base y IndexedDB) | Se conservan. Ningún código las borra | Retención oficial de fotos (P-14, P-15, P-18) |
| Cola y operaciones en IndexedDB | Se conservan. Ningún código de la cola las borra | Política de borrado de operaciones confirmadas (P-25) |
| Órdenes en IndexedDB | Se borran al llegar un paquete más nuevo que no las incluye, si no tienen estado físico y no están protegidas | Revisar con la política de P-25 |
| Borradores de captura | Se borran al registrar la visita | Ninguno |
| Datos locales al cerrar sesión | No se borran (sección 7) | Política de borrado local (P-25) |
| Datos del repositorio (seeds 005 y 006, historial de git) | Se conservan | Decisión sobre filas de personas (P-27) |

## 7. Cierre de sesión y pérdida del equipo

Cierre de sesión (verificado en `field-app/src/App.tsx` y `field-app/src/adapters/http/client.ts`):

1. La aplicación llama a `POST /v1/auth/logout`. El servidor revoca la sesión y borra la cookie (contrato, "Semántica observada").
2. Se borra la clave `sepsa.authenticated-session` de `localStorage`.

Lo que el cierre de sesión **no** borra:

- La base IndexedDB del técnico y dispositivo: paquete, órdenes, cola, evidencias, conflictos y borradores.
- El Cache Storage del mapa.
- El identificador de dispositivo.
- El nombre de usuario recordado, si el técnico lo guardó (es intencional y se borra al desmarcar la opción).

Las funciones `deleteFieldDatabase` y `deleteDatabase` existen en `field-app/src/adapters/indexeddb/database.ts` y `repository.ts`, pero ninguna se llama desde el código de producción. El cierre de sesión no las usa.

Pérdida del equipo:

- El servidor no puede borrar datos del navegador ni revocar la sesión de un dispositivo perdido: el esquema no liga la sesión a `device_id` (P-13).
- Los datos locales permanecen en el navegador hasta que alguien los borre. Borrar los datos del sitio elimina la cola de operaciones no sincronizadas.

Esta descripción es lo que el código hace hoy. Ninguna parte de ella es una garantía de borrado; la política queda como pendiente (P-25).

## 8. Pendientes

| Pendiente | Entrada en 14 |
|---|---|
| Responsable del tratamiento de los datos personales | P-24 |
| Retención y eliminación de datos personales, sesiones y auditoría | P-24 |
| Política de borrado local de IndexedDB y de la cola al cerrar sesión o perder el equipo | P-25 |
| Aviso y contrato con el proveedor de teselas | P-26 |
| Retención de fotos y su contenido | P-14, P-15, P-18 |
| Filas de personas en los seeds del repositorio y en el historial de git | P-27 |
| Proveedor de base y de hosting | P-17 |

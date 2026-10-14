# Anexo A13. Tratamiento de la información

Fuente: stores de IndexedDB y funciones de borrado de `field-app/src/adapters/indexeddb/`, `localStorage` en `field-app/src/adapters/browser/`, `field-app/src/services/map-cache.ts`, cierre de sesión en `field-app/src/App.tsx`, y ausencia de borrados en `backend/src/`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe dónde están los datos, cuáles son personales y qué borra hoy el sistema. Responsable, custodia y retención los define SEPSA.

## 1. Dónde están los datos

| Almacén | Qué contiene | Personales | Borrado hoy |
|---|---|---|---|
| Base PostgreSQL | Usuarios, sesiones, morosos, órdenes, autorizaciones, operaciones, auditoría y fotos | Sí | Ninguno. El servidor no tiene sentencias `DELETE` |
| IndexedDB de campo (por técnico y dispositivo) | Paquete, órdenes, operaciones, visitas, fotos, cola, conflictos y borradores | Sí | Solo órdenes que ya no están en un paquete más nuevo, y borradores al registrar la visita |
| `localStorage` | Identidad de la sesión (sin token), usuario recordado e identificador del dispositivo | Sí (usuario) | Solo la sesión, al cerrar sesión |
| Cache Storage de la app | Archivos de la aplicación | No | Se reemplaza al actualizar |
| Cache Storage del mapa | Teselas de la zona de las órdenes | Revela la zona visible | No se borra al cerrar sesión |
| Registros del servidor | Eventos e identificadores de petición | No, por diseño | Según el proveedor de hosting |

Un técnico que usa dos dispositivos tiene dos bases locales. Los datos sincronizados se consultan desde el servidor (RF-36).

## 2. Datos personales en la base del servidor

| Dato | Dónde está |
|---|---|
| Nombre, dirección y referencias del cliente | `debtors.customer_name`, `address`, `reference_text` |
| Documento de identidad y teléfono | `debtors.customer_ci`, `contact_phone` |
| Medidor, ubicación catastral, deuda y meses pendientes | `debtors.meter_id`, `cadastral_latitude`, `cadastral_longitude`, `debt_cents`, `months_pending` (dato personal indirecto) |
| Ubicación GPS del técnico en la captura | `sync_operations.payload` |
| Fotos de evidencia | `evidence_assets.content`; pueden mostrar personas o domicilios |
| Usuario y nombre de técnicos y administradores | `users.username`, `users.display_name` |
| Hash de contraseña | `users.password_hash`; sensible |

## 3. Envíos a terceros

- **Teselas del mapa.** La app pide las teselas a `server.arcgisonline.com`. Cada petición revela el número de tesela, es decir, la zona visible del mapa. No incluye datos de la sesión. Este uso queda declarado en esta entrega; el aviso al técnico lo da el equipo.
- **Proveedores de base y de hosting.** El repo no los define; SEPSA los define.

## 4. Retención, eliminación y cierre de sesión

Esto es lo que el código hace hoy. La retención oficial la define SEPSA.

- **Fotos:** se conservan de forma permanente, en la base y en el dispositivo. Ningún código las borra.
- **Sesiones vencidas, usuarios deshabilitados, morosos y auditoría:** se conservan. Ningún código los borra.
- **Cola y operaciones en el dispositivo:** se conservan. Es la política acordada: el técnico conserva sus datos en el dispositivo.
- **Al cerrar sesión:** el servidor revoca la sesión y la app borra la identidad guardada. No se borran datos de trabajo.
- **Al perder el equipo:** el servidor no puede borrar datos del navegador ni revocar la sesión del dispositivo, porque el esquema no liga la sesión a un dispositivo.

## 5. Pendientes

- Responsable del tratamiento, custodia y retención de datos personales: decisión de SEPSA.
- Filas de personas en los seeds `005` y `006` y en el historial de git: acción acordada, eliminarlas del repo. Requiere cambio de código, porque el seed `005` lo usa el bootstrap. Reescribir el historial es una decisión aparte.

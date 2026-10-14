# 13. Tratamiento de la información

Fuente: stores de IndexedDB y funciones de borrado de `field-app/src/adapters/indexeddb/`, `localStorage` en `field-app/src/adapters/browser/`, `field-app/src/services/map-cache.ts`, cierre de sesión en `field-app/src/App.tsx`, y ausencia de borrados en `backend/src/`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe dónde están los datos, cuáles son personales y qué borra hoy el sistema. Responsable, custodia y retención los define SEPSA. Inventario completo en el anexo A13.

## 1. Dónde están los datos

- **Base PostgreSQL:** usuarios, sesiones, morosos, órdenes, autorizaciones, operaciones, auditoría y fotos. Personal. No se borra nada: el servidor no tiene sentencias `DELETE`.
- **IndexedDB de campo (por técnico y dispositivo):** paquete, órdenes, operaciones, visitas, fotos, cola, conflictos y borradores. Personal. Se borra solo lo que ya no está en un paquete más nuevo, y los borradores al registrar la visita.
- **`localStorage`:** identidad de la sesión sin token, usuario recordado e identificador del dispositivo. Personal (usuario). Se borra la sesión al cerrar sesión.
- **Cache Storage:** archivos de la aplicación (no personales, se reemplazan al actualizar) y teselas del mapa (revelan la zona visible; no se borran al cerrar sesión).
- **Registros del servidor:** eventos e identificadores de petición, sin datos personales por diseño.

Un técnico con dos dispositivos tiene dos bases locales; los datos sincronizados se consultan desde el servidor (RF-36).

## 2. Datos personales en el servidor

Nombre, dirección y referencias del cliente; documento de identidad y teléfono; medidor, ubicación catastral, deuda y meses pendientes (dato personal indirecto); ubicación GPS del técnico en la captura; fotos de evidencia (pueden mostrar personas o domicilios); usuario y nombre de técnicos y administradores; y hash de contraseña (sensible). Las columnas exactas están en el anexo.

## 3. Terceros

- **Teselas del mapa:** la app pide teselas a `server.arcgisonline.com`. Cada petición revela la zona visible; no incluye datos de la sesión. El uso queda declarado en esta entrega.
- **Base y hosting:** el repo no los define; SEPSA los define.

## 4. Retención y cierre de sesión

- Fotos, sesiones vencidas, usuarios deshabilitados, morosos y auditoría: se conservan. Ningún código los borra.
- Cola y operaciones del dispositivo: se conservan, por la política acordada.
- Al cerrar sesión: el servidor revoca la sesión y la app borra la identidad guardada; no se borran datos de trabajo.
- Al perder el equipo: el servidor no puede borrar los datos del navegador ni revocar la sesión del dispositivo.

## 5. Pendientes

- Responsable, custodia y retención de datos personales: decisión de SEPSA.
- Filas de personas en los seeds `005` y `006` y en el historial de git: se retiraron del repo; eliminarlas del historial es una decisión aparte, y `005` lo usa el bootstrap.

# 03. Arquitectura y tecnologías

Fuente: `field-app/package.json`, `backend/package.json`, `backend/Dockerfile`, `render.yaml`, `field-app/vercel.json`, `.github/workflows/ci.yml` y el código fuente.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el piloto provisional, no la arquitectura oficial de SEPSA.

## 1. Vista general

Tres partes. La **aplicación de campo y administración** (navegador) funciona sin conexión y guarda el trabajo en el dispositivo. El **servidor** (API REST) valida cada permiso y cada operación. La **base PostgreSQL** es la fuente autoritativa del piloto.

## 2. Tecnologías

| Parte | Tecnología |
|---|---|
| Interfaz | React 19, TypeScript 5, Vite 7; PWA con Service Worker; Leaflet para el mapa |
| Almacenamiento local | IndexedDB (órdenes, operaciones, fotos, cola y borradores) |
| Servidor | Node.js 22 con TypeScript; API REST con módulo HTTP propio, sin framework |
| Base de datos | PostgreSQL 16 mediante `pg` |
| Imágenes | `sharp`, solo para comprobar que la foto se pueda leer dentro de los límites |
| Pruebas | Vitest, `fake-indexeddb`, `node:test` |
| Integración con SEPSA | No existe. Se usa un adaptador provisional |

Las versiones exactas son las de los archivos de bloqueo. El entorno de referencia es Node 22.12.0.

## 3. Aplicación de campo

Se organiza por responsabilidad: `domain/` (reglas de negocio), `ports/` (contratos), `use-cases/` (corte, reconexión, visita, sincronización, descarga y administración), `adapters/` (IndexedDB, HTTP, navegador y simulado), `state/` y `bootstrap/` (estado y construcción), y `screens/` y `components/` (pantallas). Las reglas de dependencia entre carpetas se verifican con pruebas.

## 4. Servidor

| Capa | Hace | No hace |
|---|---|---|
| Transporte | Cabeceras, origen, sesión y errores | Reglas de negocio |
| Controladores | Validan la forma de la petición y el rol | Consultas SQL |
| Servicios | Roles, duplicados, versiones, idempotencia, autorización de un solo uso, aceptación de cortes y reconexiones, auditoría | — |
| Repositorios | Consultas SQL | Conocer HTTP |

El servidor responde a 24 rutas. Su matriz de permisos está en la documentación de seguridad.

## 5. Modos de ejecución

- **Simulado:** solo en desarrollo, o con `VITE_ENABLE_SIMULATION=true`. Los datos viven en el navegador. El despliegue no lo incluye.
- **Conectado:** con la dirección del servidor. Es el modo del piloto.

## 6. Flujo de datos

La acción valida identidad, asignación, estado y datos de campo. La operación se guarda en IndexedDB con su identificador y su lugar en la cola, y solo después se confirma al usuario. El motor de sincronización la envía cuando hay conexión útil. El servidor aplica idempotencia, autorización, conflictos y auditoría en una sola transacción.

## 7. Despliegue del piloto

- **Servidor:** imagen Docker en Render, con control de salud en `/healthz`.
- **Base de datos:** PostgreSQL 16 en Docker Compose para desarrollo. La base de producción no está definida en el repo.
- **Aplicación de campo:** Vercel, que reenvía `/v1/*` al servidor en el mismo origen.

## 8. Límites

- El servidor no es la API oficial de SEPSA.
- Sin conexión no hay corte: la autorización en línea es obligatoria.
- Render y Neon están en planes gratuitos. La primera petición tras un periodo de inactividad puede tardar cerca de un minuto; la cola local no se pierde.
- El límite de intentos de acceso vive en la memoria de un proceso.
- La sesión no se liga a un dispositivo. Ver la lista de pendientes.

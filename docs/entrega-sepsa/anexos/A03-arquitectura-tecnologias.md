# Anexo A03. Arquitectura y tecnologías

Fuente: `field-app/package.json`, `backend/package.json`, `backend/Dockerfile`, `render.yaml`, `field-app/vercel.json`, `.github/workflows/ci.yml` y el código fuente.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el piloto provisional, no la arquitectura oficial de SEPSA.

## 1. Vista general

Tres partes: la **aplicación de campo y administración** (navegador), que trabaja sin conexión y guarda en el dispositivo; el **servidor** (API REST), que valida cada permiso y operación; y la **base PostgreSQL**, fuente autoritativa del piloto.

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

Las versiones exactas son las de los archivos de bloqueo. Entorno de referencia: Node 22.12.0.

## 3. Organización

- **Aplicación de campo:** `domain/` (reglas), `ports/` (contratos), `use-cases/` (corte, reconexión, visita, sincronización, descarga y administración), `adapters/` (IndexedDB, HTTP, navegador y simulado), `state/` y `bootstrap/`, `screens/` y `components/`. Las reglas de dependencia se verifican con pruebas.
- **Servidor:** cada capa tiene una función y un límite.

| Capa | Hace | No hace |
|---|---|---|
| Transporte | Cabeceras, origen, sesión y errores | Reglas de negocio |
| Controladores | Validan la forma de la petición y el rol | Consultas SQL |
| Servicios | Roles, duplicados, versiones, idempotencia, autorización de un solo uso, aceptación de cortes y reconexiones, auditoría | — |
| Repositorios | Consultas SQL | Conocer HTTP |

El servidor responde a 24 rutas; su matriz de permisos está en la sección 12.

## 4. Modos y flujo

- **Simulado:** solo en desarrollo, o con `VITE_ENABLE_SIMULATION=true`. Los datos viven en el navegador. El despliegue no lo incluye.
- **Conectado:** con la dirección del servidor. Es el modo del piloto.
- **Flujo:** la acción valida identidad, asignación, estado y datos de campo; la operación se guarda en IndexedDB con su identificador y su lugar en la cola, y solo después se confirma al usuario. El motor de sincronización la envía con conexión útil. El servidor aplica idempotencia, autorización, conflictos y auditoría en una transacción.

## 5. Despliegue del piloto

- **Servidor:** imagen Docker en Render, con control de salud en `/healthz`.
- **Base de datos:** PostgreSQL 16 en Docker Compose para desarrollo. La base de producción no está definida en el repo.
- **Aplicación de campo:** Vercel, que reenvía `/v1/*` al servidor en el mismo origen.

## 6. Límites

- El servidor no es la API oficial de SEPSA.
- Render y Neon están en planes gratuitos: la primera petición tras inactividad puede tardar cerca de un minuto; la cola local no se pierde.
- Sin conexión no hay corte; el límite de intentos y la sesión se describen en la sección 12.
- La sesión no se liga a un dispositivo (ver sección 14).

# 03. Arquitectura y tecnologías

Fuente: `field-app/package.json`, `backend/package.json`, `backend/Dockerfile`, `render.yaml`, `field-app/vercel.json`, `.github/workflows/ci.yml` y el código fuente.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el piloto provisional, no la arquitectura oficial de SEPSA. Detalle en el anexo A03.

## 1. Vista general

Tres partes: la **aplicación de campo y administración** (navegador), que trabaja sin conexión y guarda en el dispositivo; el **servidor** (API REST), que valida cada permiso y operación; y la **base PostgreSQL**, fuente autoritativa del piloto.

## 2. Tecnologías

- **Interfaz:** React 19, TypeScript 5, Vite 7; PWA con Service Worker; Leaflet para el mapa; IndexedDB para el almacenamiento local.
- **Servidor:** Node.js 22 con TypeScript y una API REST con módulo HTTP propio, sin framework; PostgreSQL 16 mediante `pg`; `sharp` solo para comprobar que la foto se pueda leer.
- **Pruebas:** Vitest, `fake-indexeddb` y `node:test`.
- **Integración con SEPSA:** no existe; se usa un adaptador provisional.

## 3. Modos y despliegue

- **Simulado:** solo en desarrollo o con `VITE_ENABLE_SIMULATION=true`; los datos viven en el navegador. El despliegue no lo incluye.
- **Conectado:** con la dirección del servidor; es el modo del piloto.
- **Despliegue del piloto:** servidor como imagen Docker en Render, con control de salud en `/healthz`; PostgreSQL 16 en Docker Compose para desarrollo (la base de producción no está definida en el repo); aplicación en Vercel, que reenvía `/v1/*` al servidor.

## 4. Límites

- El servidor no es la API oficial de SEPSA.
- Render y Neon están en planes gratuitos; la cola local no se pierde si la primera petición tras inactividad tarda.
- El límite de intentos de acceso y la sesión se describen en el documento 12. La sesión no se liga a un dispositivo (ver pendientes).

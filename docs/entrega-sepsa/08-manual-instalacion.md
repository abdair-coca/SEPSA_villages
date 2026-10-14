# 08. Manual de instalación

Fuente: `README.md`, `backend/README.md`, `backend/.env.example`, `field-app/.env.example`, `backend/src/config.ts` y `backend/package.json`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe la instalación para desarrollo y pruebas. Para producción, ver el manual técnico. Variables completas y verificación en el anexo A08.

## 1. Requisitos

Node.js `>= 22.12.0` para el servidor y `^22.12.0`, `^24.0.0` o `>= 26.0.0` para la aplicación. PostgreSQL 16, o Docker con Docker Compose. Para la carga de datos de prueba, `psql` y Python 3; para las pruebas de navegador, Chrome o Chromium.

## 2. Pasos

1. **Servidor:** en `backend/`, copiar `.env.example` a `.env`, definir `DATABASE_URL`, ejecutar `npm ci` y `npm run build`. Para desarrollo, `npm run dev`.
2. **Base de datos:** con Docker Compose (`docker compose up --build`; PostgreSQL en el puerto `15432`, API en `8080`), o con un PostgreSQL propio mediante `npm run pilot:bootstrap` (solo en una base vacía). Los datos de prueba son opcionales.
3. **Aplicación:** en `field-app/`, `npm ci`; para desarrollo sin servidor, `npm run dev`; para desarrollo conectado, definir `VITE_PILOT_BACKEND_URL`; para producción, `npm run build`.
4. **Pruebas sin base de datos:** en `backend/`, `npm run test:unit`.

## 3. Variables principales

- **Servidor:** `DATABASE_URL`, `PORT`/`HOST`, `NODE_ENV` (con `production`, cookie `Secure`), `SESSION_TTL_SECONDS` (7 días), `AUTHORIZATION_TTL_SECONDS` (300 s), `HTTP_MAX_BODY_BYTES`, `CORS_ORIGIN`, `COOKIE_SECURE` y `LOGIN_RATE_LIMIT_*`.
- **Aplicación:** `VITE_PILOT_BACKEND_URL` y `VITE_ENABLE_SIMULATION`.

Cada variable con su valor por defecto está en el anexo A08.

## 4. Diferencias entre documentación y repositorio

- `backend/README.md` dice que `pilot:bootstrap` aplica `002`, `007` y `008`; el script aplica además `001`, `003_reference_fields`, los seeds `002` y `005`, la semilla `004` (vacía) y `007_role_grants`.
- `.env.example` no incluye `COOKIE_SECURE` ni las variables `LOGIN_RATE_LIMIT_*`.
- `HTTP_MAX_BODY_BYTES` vale `2097152` en el ejemplo y `12000000` por defecto.
- El README del backend pide `npm install`; la integración continua usa `npm ci`.

## 5. Verificación

Ejecutada el 2026-10-12 en una copia limpia de `main`, con Node v24.14.1 (no con Node 22.12.0, referencia del CI): `npm ci` y `npm run build` en servidor y aplicación, sin vulnerabilidades reportadas y con código 0; `npm run test:unit` del servidor, 55 pruebas que pasan.

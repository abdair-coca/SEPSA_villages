# 08. Manual de instalación

Fuente: `README.md`, `backend/README.md`, `backend/.env.example`, `field-app/.env.example`, `backend/src/config.ts` y `backend/package.json`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe la instalación para desarrollo y pruebas. Para producción, ver el manual técnico.

## 1. Requisitos

- **Node.js:** servidor `>= 22.12.0`; aplicación `^22.12.0`, `^24.0.0` o `>= 26.0.0`.
- **PostgreSQL 16**, o Docker con Docker Compose.
- Para la carga de datos de prueba: `psql` y Python 3. Para las pruebas de navegador: Chrome o Chromium.

## 2. Variables de entorno

**Servidor** (`backend/.env`, copiado de `.env.example`):

| Variable | Por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | Vacía | Conexión a PostgreSQL |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Puerto e interfaz de escucha |
| `NODE_ENV` | — | Con `production`, la cookie usa `Secure` |
| `SESSION_TTL_SECONDS` | `604800` (7 días) | Vida de la sesión |
| `AUTHORIZATION_TTL_SECONDS` | `300` | Vigencia de una autorización de corte |
| `HTTP_MAX_BODY_BYTES` | `12000000` (el despliegue usa `2097152`) | Tamaño máximo del cuerpo |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen exacto permitido; no usar `*` fuera de desarrollo |
| `COOKIE_SECURE` | `false` | `true` activa la cookie `Secure` |
| `LOGIN_RATE_LIMIT_MAX`, `_WINDOW_SECONDS`, `_MAX_ENTRIES` | `5`, `60`, `10000` | Límite de intentos de acceso |

**Aplicación** (`field-app/.env`): `VITE_PILOT_BACKEND_URL` define la dirección del servidor; sin ella, la app arranca en modo simulado, solo en desarrollo. `VITE_ENABLE_SIMULATION=true` incluye el modo simulado en el build de pruebas.

## 3. Pasos

1. **Servidor:** en `backend/`, copiar `.env.example` a `.env`, editar `DATABASE_URL`, ejecutar `npm ci` y `npm run build`. Para desarrollo: `npm run dev`.
2. **Base de datos**, una de estas opciones:
   - **Docker Compose** (desarrollo): `docker compose up --build` en `backend/`. PostgreSQL queda en el puerto `15432` y la API en `8080`.
   - **PostgreSQL propio:** `npm run pilot:bootstrap`. Crea el esquema en una base vacía; si la base tiene datos, se detiene.
   - **Datos de prueba (opcional):** `npm run pilot:field-test` y `npm run pilot:migrate:field-test`. Ver el manual técnico.
3. **Aplicación:** en `field-app/`, ejecutar `npm ci`. Para desarrollo sin servidor: `npm run dev`. Para desarrollo conectado, definir `VITE_PILOT_BACKEND_URL`. Para producción: `npm run build`.
4. **Pruebas sin base de datos:** en `backend/`, `npm run test:unit`.

## 4. Diferencias entre la documentación y el código

- `backend/README.md` dice que `pilot:bootstrap` aplica `002`, `007` y `008`. El script aplica además `001`, `003_reference_fields`, los seeds `002` y `005`, la semilla `004` (vacía) y `007_role_grants`.
- `.env.example` no incluye `COOKIE_SECURE` ni las variables `LOGIN_RATE_LIMIT_*`.
- `HTTP_MAX_BODY_BYTES` vale `2097152` en el ejemplo y `12000000` por defecto.
- El README del backend pide `npm install`; la integración continua usa `npm ci`.

## 5. Verificación

Ejecutada el 2026-10-12 en una copia limpia del código, con Node v24.14.1 (no con Node 22.12.0, que es la referencia del CI).

| Paso | Resultado |
|---|---|
| `npm ci` en servidor y aplicación | Código 0; 0 vulnerabilidades reportadas |
| `npm run build` en servidor y aplicación | Código 0 |
| `npm run test:unit` en servidor | 55 pruebas pasan, 0 fallan |

# Manual de instalación

Fuente: `README.md`, `backend/README.md`, `backend/.env.example`, `field-app/.env.example`, `backend/src/config.ts`, `backend/package.json`, `field-app/package.json`, `backend/docker-compose.yml`, `backend/scripts/bootstrap-pilot.mjs`, `backend/scripts/import-debtors-xlsx.py`, `backend/migrations/20260923-load-excel-20260922.mjs`, `backend/Dockerfile`, `docs/DECISIONS.md` (D018, D023).
Fecha: 2026-10-12
Estado: entrega, copia fechada. Los pasos y resultados de la sección 5 se verificaron en una copia limpia de `main` (`git archive HEAD`), no en el repositorio de trabajo.

Este manual describe cómo instalar el piloto para desarrollo y pruebas, y qué revisar antes de un despliegue. El despliegue en producción está en [07-manual-tecnico.md](07-manual-tecnico.md). Los términos técnicos están en el [glosario](05-diccionario-datos.md#glosario-de-términos-y-estados).

## 1. Requisitos

| Herramienta | Versión | Para qué | Obligatoria |
|---|---|---|---|
| Node.js | Servidor: `>=22.12.0`. Aplicación: `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | Ejecutar el servidor, compilar y probar. La integración continua usa `22.12.0`. | Sí |
| npm | La que viene con Node | Instalar dependencias | Sí |
| PostgreSQL | 16 (`postgres:16-alpine` en Compose) | Base de datos del servidor | Sí, o Docker |
| Docker y Docker Compose | Versión reciente | Levantar PostgreSQL y el servidor con un comando | No |
| Cliente `psql` | Cualquiera compatible con PostgreSQL 16 | Solo para `npm run pilot:field-test` | No |
| Python 3 | Biblioteca estándar | Solo para `npm run pilot:field-test` | No |
| Google Chrome o Chromium | Reciente | Solo para `npm run e2e:browser` y las pruebas de humo. Se indica con `CHROME_PATH` | No |

## 2. Variables de entorno

### 2.1 Servidor (`backend/`)

Se copian desde `backend/.env.example` a `backend/.env`. La tabla muestra el valor por defecto que aplica si la variable no está definida (`backend/src/config.ts`).

| Variable | Valor por defecto | Valor en `.env.example` | Uso |
|---|---|---|---|
| `NODE_ENV` | — | `development` | Con `production`, la cookie de sesión usa `Secure` |
| `HOST` | `0.0.0.0` | `0.0.0.0` | Interfaz en la que escucha el servidor |
| `PORT` | `8080` | `8080` | Puerto HTTP |
| `DATABASE_URL` | Vacía | Cadena de conexión de ejemplo | Conexión a PostgreSQL. Sin base, `/healthz` informa que la base no está disponible |
| `SESSION_TTL_SECONDS` | `604800` (7 días) | `604800` (7 días) | Vida de la sesión. El despliegue usa el mismo valor (D025) |
| `AUTHORIZATION_TTL_SECONDS` | `300` | `300` | Vigencia de una autorización de corte |
| `HTTP_MAX_BODY_BYTES` | `12000000` | `2097152` (2 MB) | Tamaño máximo del cuerpo de una petición. El despliegue usa 2 MB, suficiente para una foto de hasta 1 MB (D018) |
| `CORS_ORIGIN` | `http://localhost:5173` | `http://localhost:5173` | Origen exacto que puede llamar a la API. No usar `*` fuera de desarrollo |
| `COOKIE_SECURE` | `false` | No está | `true` activa la cookie `Secure` aunque `NODE_ENV` no sea `production` |
| `LOGIN_RATE_LIMIT_MAX` | `5` | No está | Intentos de inicio de sesión permitidos por ventana |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `60` | No está | Duración de la ventana del límite |
| `LOGIN_RATE_LIMIT_MAX_ENTRIES` | `10000` | No está | Entradas que el límite guarda en memoria |

`CHROME_PATH` la usan solo las pruebas de navegador (`e2e:browser`). No se define en el repo.

### 2.2 Aplicación (`field-app/`)

Se copia desde `field-app/.env.example` a `field-app/.env` si se necesita. Las variables son de compilación (Vite).

| Variable | Valor por defecto | Uso |
|---|---|---|
| `VITE_PILOT_BACKEND_URL` | Vacía | Dirección del servidor. Sin ella, la aplicación arranca en modo simulado, solo en desarrollo. En el despliegue de Vercel, las rutas `/v1/*` se reenvían al servidor en el mismo origen (`field-app/vercel.json`) |
| `VITE_ENABLE_SIMULATION` | No definida | `true` incluye el modo simulado en los builds de humo (D023). El build de producción no lo incluye |

## 3. Instalación paso a paso

### 3.1 Obtener el código

```sh
git clone <url-del-repositorio>
cd <carpeta-del-repositorio>
```

### 3.2 Servidor

1. Entrar a la carpeta del servidor y crear el archivo de variables:

   ```sh
   cd backend
   cp .env.example .env
   ```

   Editar `DATABASE_URL` para que apunte a la base de PostgreSQL que se usará. No guardar contraseñas reales en el repositorio.

2. Instalar dependencias. Para una instalación reproducible se usa el archivo de bloqueo:

   ```sh
   npm ci
   ```

   `npm install` también funciona, pero puede cambiar versiones dentro de los rangos del `package.json`.

3. Compilar:

   ```sh
   npm run build
   ```

4. Ejecutar en desarrollo (recarga automática):

   ```sh
   npm run dev
   ```

   Para ejecutar la versión compilada: `npm start`, después de `npm run build`.

### 3.3 Base de datos

Hay tres opciones. Elegir una.

**Opción A: Docker Compose (recomendada para desarrollo).**

```sh
cd backend
docker compose up --build
```

- PostgreSQL 16 queda publicado en el puerto `15432` del equipo y la API en `8080`.
- Compose ejecuta los SQL de inicialización solo al crear un volumen vacío.
- Al iniciar la API, `scripts/apply-startup-schema-migrations.mjs` aplica `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql`, también con un volumen existente.

**Opción B: PostgreSQL propio, con el script de inicialización.**

```sh
cd backend
npm run pilot:bootstrap
```

- Crea el esquema en una base vacía. Si la base ya tiene datos, el script se detiene con el error `Pilot database already contains data; bootstrap aborted.`. Aun así, conviene revisar la base antes de ejecutarlo.
- Aplica, en este orden: `001_init.sql`, `002_evidence_assets.sql`, `seeds/002_seed.sql`, `003_reference_fields.sql`, `seeds/004_e2e_seed.sql` (vacío a propósito), `seeds/005_definitive_seed.sql`, `007_work_package_versions.sql`, `007_role_grants.sql` y `008_reconnection_schema.sql`.
- Esta lista es más larga que la del `backend/README.md`, que menciona solo `002`, `007` y `008`. Ver la sección 4.

**Opción C: datos de prueba de campo (opcional).**

```sh
cd backend
npm run pilot:field-test           # importa un libro de Excel; requiere psql y Python 3
npm run pilot:migrate:field-test   # aplica la carga del conjunto de prueba
npm run pilot:migrate:roles        # aplica los grants de roles
```

`pilot:migrate:field-test` es la carga de datos de prueba. Ya no se ejecuta al arrancar la imagen (D026); el archivo `backend/migrations/data/EXCEL_20260922.json` no está en el repo. Crea órdenes con el umbral de 3 meses. Como la carga del arranque, está protegida por `pilot_migrations`: con el mismo checksum no vuelve a escribir. Ver [07-manual-tecnico.md](07-manual-tecnico.md), sección 1.1, antes de usarla fuera de desarrollo.

### 3.4 Aplicación de campo y administración

1. Entrar a la carpeta de la aplicación e instalar dependencias:

   ```sh
   cd field-app
   npm ci
   ```

2. Desarrollo sin servidor (modo simulado, solo en desarrollo):

   ```sh
   npm run dev
   ```

3. Desarrollo conectado al servidor: definir `VITE_PILOT_BACKEND_URL` con la dirección del servidor (por ejemplo `http://localhost:8080`) y luego `npm run dev`.

4. Compilar el build de producción y revisar la vista previa:

   ```sh
   npm run build
   npm run preview
   ```

   `npm run build` ejecuta primero la comprobación de tipos (`tsc --noEmit`) y después `vite build`.

### 3.5 Pruebas que no requieren base de datos

```sh
cd backend
npm run test:unit
```

Las pruebas de integración con PostgreSQL (`npm test` y `npm run test:integration`) requieren `DATABASE_URL` y están en la entrega de resultados (F5).

## 4. Diferencias entre la documentación y el repositorio

- **Bootstrap.** `backend/README.md` dice que `pilot:bootstrap` incluye `002`, `007` y `008`. El script aplica además `001_init.sql`, `003_reference_fields.sql`, las semillas `002` y `005`, la semilla `004` (vacía) y `007_role_grants.sql`. Esta entrega sigue el script.
- **Variables de ejemplo.** `backend/.env.example` no incluye `COOKIE_SECURE` ni las variables `LOGIN_RATE_LIMIT_*`. Sus valores por defecto aplican cuando no se definen.
- **Valores de ejemplo distintos de los por defecto.** `HTTP_MAX_BODY_BYTES` vale `2097152` en el ejemplo y `12000000` por defecto. Un desarrollo que copie el ejemplo tendrá el valor del ejemplo.
- **Dependencias.** El `backend/README.md` pide `npm install`. La integración continua usa `npm ci`, que es la forma reproducible.

## 5. Verificación de la instalación

Se ejecutó el 2026-10-12 en una copia limpia de `main` (`git archive HEAD`) en una carpeta temporal, con Node v24.14.1 y npm 11.11.0. No se ejecutó con Node 22.12.0, que es la versión de la integración continua.

| Paso | Comando | Resultado |
|---|---|---|
| Servidor: dependencias | `npm ci` en `backend` | Código 0; 0 vulnerabilidades reportadas |
| Servidor: compilación | `npm run build` en `backend` | Código 0 |
| Servidor: pruebas sin base de datos | `npm run test:unit` en `backend` | 55 pruebas pasadas, 0 fallidas |
| Aplicación: dependencias | `npm ci` en `field-app` | Código 0; 0 vulnerabilidades reportadas |
| Aplicación: compilación | `npm run build` en `field-app` | Código 0; genera el build de producción |

No se ejecutaron en esta verificación: `npm test` del servidor (requiere PostgreSQL), las pruebas de la aplicación (`npm test`) ni las pruebas de humo (`smoke:ui`, `smoke:pwa`). Se registrarán en `11-resultados-pruebas.md` (pendiente, F5).

## 6. Pendientes

Los pendientes de infraestructura (proveedor, topología, TLS, rotación de secretos, copias de seguridad) están en [07-manual-tecnico.md](07-manual-tecnico.md), sección 6, y en [14-pendientes-sepsa.md](14-pendientes-sepsa.md) (P-11, P-17).

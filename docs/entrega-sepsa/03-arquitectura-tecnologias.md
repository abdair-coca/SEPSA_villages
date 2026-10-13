# Arquitectura y tecnologías del piloto

Fuente: `docs/ARCHITECTURE.md` (CURRENT y Límites importantes), `docs/PROJECT.md` (Stack actual), `field-app/package.json`, `backend/package.json`, `backend/Dockerfile`, `backend/docker-compose.yml`, `render.yaml`, `field-app/vercel.json`, `.github/workflows/ci.yml`, `backend/src/services/evidence-image.service.ts`, `docs/api/pilot-contract.md`, `docs/DECISIONS.md` (D023), `field-app/src/bootstrap/runtime.ts`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el piloto provisional; no es la arquitectura oficial de SEPSA.

Los términos técnicos se explican en el [glosario](05-diccionario-datos.md#glosario-de-términos-y-estados). Los nombres entre paréntesis son los que aparecen en el código y en la configuración.

## 1. Vista general

El sistema tiene tres partes:

```text
Aplicación de campo y administración (navegador)      field-app
  ├─ reglas de negocio
  ├─ casos de uso (acciones del usuario)
  ├─ almacenamiento local en el dispositivo (IndexedDB)
  └─ conexión con el servidor (HTTP)
          │
          ▼
Servidor del piloto (API REST)                         backend
  └─ acceso, órdenes, autorización, sincronización y auditoría
          │
          ▼
Base de datos (PostgreSQL)
```

La aplicación de campo y administración corre en el navegador y funciona sin conexión. Guarda los datos de trabajo en el dispositivo. El servidor vuelve a validar cada permiso y cada operación antes de aceptarla. La base de datos PostgreSQL es la fuente autoritativa del piloto.

## 2. Tecnologías

| Parte | Tecnología | Para qué sirve | Versión o rango en el repo |
|---|---|---|---|
| Interfaz | React | Construye las pantallas. | `^19.0.0` |
| Interfaz | TypeScript | Lenguaje con tipos, que ayuda a evitar errores. | `^5.8.0` |
| Interfaz | Vite | Herramienta para compilar y ejecutar la interfaz. | `^7.0.0` |
| Interfaz | PWA (aplicación web instalable) | Permite usar la aplicación de campo como una app en el celular. | — |
| Mapas | Leaflet | Muestra el mapa de las órdenes del técnico. | `^1.9.4` |
| Tipografía | Manrope | Tipo de letra, incluido en la aplicación. | `^5.3.0` |
| Almacenamiento local | IndexedDB | Base de datos del navegador del dispositivo: guarda borradores, fotos, operaciones y la cola de envío. | API del navegador |
| Trabajo sin conexión | Service Worker | Guarda los archivos de la aplicación para abrirla sin red. | `field-app/public/sw.js` |
| Servidor | Node.js con TypeScript | Ejecuta el servidor de la API. El servidor usa el módulo HTTP propio de Node, sin framework. | Node `>=22.12.0` |
| Base de datos | PostgreSQL | Guarda la información del piloto. | `postgres:16-alpine` (Compose); `postgres:16.4-alpine` (CI) |
| Acceso a la base | `pg` | Conecta el servidor con PostgreSQL. | `^8.16.3` |
| Imágenes | `sharp` | Comprueba que cada foto se pueda leer completa dentro de los límites. No la transforma. | `^0.35.5` |
| Pruebas de interfaz | Vitest, `fake-indexeddb` | Pruebas automáticas de la aplicación de campo. | Vitest `^5.0.0`; `fake-indexeddb` `^6.2.5` |
| Pruebas del servidor | `node:test` con `tsx` | Pruebas automáticas del servidor. | Incluido en Node |
| Integración oficial de SEPSA | No existe | — | Se usa un adaptador provisional (`PILOT_PROVISIONAL`) |

Los rangos con `^` se resuelven con los archivos de bloqueo (`package-lock.json`). Las versiones exactas instaladas son las del archivo de bloqueo, no las de esta tabla.

Entorno de ejecución:

- Imagen del servidor: `node:22-alpine` (`backend/Dockerfile`).
- Node en la integración continua (CI): `22.12.0` (`.github/workflows/ci.yml`).
- Aplicación de campo: `engines.node` `^22.12.0 || ^24.0.0 || >=26.0.0` (`field-app/package.json`).

## 3. Aplicación de campo y administración (field-app)

`field-app/` contiene la aplicación. Su código se organiza por tipo de responsabilidad:

| Carpeta | Responsabilidad |
|---|---|
| `src/domain/` | Tipos y reglas de negocio, sin depender de la interfaz |
| `src/ports/` | Contratos entre las acciones del usuario y los adaptadores |
| `src/use-cases/` | Acciones del usuario: corte, reconexión, visita, sincronización, descarga y administración |
| `src/adapters/` | Conexión con IndexedDB, con el servidor (HTTP), con el navegador y versiones simuladas |
| `src/state/` | Estado de la jornada del técnico |
| `src/bootstrap/` | Construcción de los componentes según el modo de ejecución |
| `src/screens/` | Pantallas de administración, campo y acceso |
| `src/components/` | Componentes con lógica visible |
| `src/services/`, `src/utils/`, `src/styles/` | Servicios sin interfaz, funciones de presentación y hojas de estilo |

Las reglas de dependencia entre carpetas se verifican automáticamente en `field-app/src/architecture.test.ts`. El detalle de cada archivo está en `06-documentacion-codigo.md` (pendiente, F3).

El estado de la pantalla solo representa la vista actual. Los datos de trabajo viven en el almacenamiento local del dispositivo.

## 4. Servidor (backend)

`backend/` es el servidor de la API. Maneja sesiones, roles (`ADMIN`: administrador; `TECHNICIAN`: técnico), transacciones de base de datos y auditoría. El origen de los datos se marca como `PILOT_PROVISIONAL`.

Las capas del servidor y sus reglas:

| Capa (nombre técnico) | Qué hace | Qué no hace |
|---|---|---|
| Transporte (`http/`) | Recibe la petición, las cabeceras, el origen (CORS), la sesión, los errores y la tabla de rutas | No aplica reglas de negocio |
| Controladores (`controllers/`) | Validan la forma de la petición, revisan el rol, llaman al servicio y responden | No ejecutan consultas SQL |
| Servicios (`services/`) | Reglas de negocio: roles, duplicados, versiones, idempotencia, autorización de un solo uso, aceptación de cortes y reconexiones, auditoría. Abren las transacciones | — |
| Repositorios (`repositories/`) | Consultas SQL a la base | No conocen HTTP |
| Mapeadores (`mappers/`) | Convierten filas de la base en respuestas JSON | — |
| Compartido (`shared/`) | Configuración, cifrado de contraseñas y tokens, límite de intentos de acceso, paginación y validación | — |
| Registros (`logging/`) | Eventos de seguridad sin contraseñas, tokens ni datos personales | — |

La regla de dependencia es: `controladores → servicios → repositorios → base de datos`. `backend/test/architecture.test.ts` verifica que los controladores no contengan SQL y que los repositorios no importen HTTP.

Contrato HTTP: `backend/openapi/pilot-provisional.openapi.json`. Está resumido en `docs/api/pilot-contract.md`. Es provisional y no está aprobado por SEPSA.

## 5. Modos de ejecución

La aplicación de campo arranca en uno de estos modos:

| Modo | Condición | Qué hace |
|---|---|---|
| Local o simulado | Solo en desarrollo o con `VITE_ENABLE_SIMULATION=true`; sin URL de servidor | La autoridad y los datos de demostración viven en el navegador. No se incluye en el despliegue (D023) |
| Piloto conectado | Con `VITE_PILOT_BACKEND_URL` o en el despliegue | Usa el servidor provisional a través de `HttpPilotClient` |

En el modo simulado, los pasos que normalmente harían en el servidor los resuelve `adapters/indexeddb/authority-repository.ts`. Sin URL de servidor y sin simulación, la aplicación avisa que no tiene servidor configurado (D023).

## 6. Flujo de datos

1. La pantalla llama a una acción (caso de uso o servicio).
2. El dominio valida identidad, asignación, estado y datos de campo.
3. La operación se guarda de forma atómica en IndexedDB, junto con su identificador de operación y su lugar en la cola de envío.
4. La aplicación confirma al usuario solo después de comprobar que quedó guardada.
5. El motor de sincronización envía la operación cuando hay conexión útil.
6. El servidor aplica idempotencia, autorización, conflictos y auditoría en la misma transacción.
7. La cola conserva las operaciones fallidas o inciertas para reintentarlas de forma segura o para revisión humana.

## 7. Despliegue del piloto

| Componente | Configuración en el repo | Observación |
|---|---|---|
| Servidor | `backend/Dockerfile` y `render.yaml` (servicio `sepsa-pilot-api`, con contenedor Docker y control de salud en `/healthz`) | Al arrancar ejecuta, en este orden: migraciones de arranque, migración de roles y después el servidor. La carga de datos de prueba no se ejecuta al arrancar (D026) |
| Base de datos | `backend/docker-compose.yml` (PostgreSQL 16) para desarrollo | La topología de producción no está definida (P-11) |
| Aplicación de campo | `field-app/vercel.json` | Reenvía `/v1/*` al servidor en Render y marca esas respuestas como `no-store` |

Observaciones del despliegue:

- `render.yaml` configura un servicio de plan `free` en la región `oregon`. Es la configuración del piloto, no una decisión de producción.
- `field-app/vercel.json` hace que la aplicación y la API compartan origen para las rutas `/v1/*`. La cookie de sesión depende de que el navegador envíe el contexto correcto; la topología definitiva está pendiente (`docs/api/pilot-contract.md`).
- `render.yaml` declara `NODE_ENV=production`, `HOST`, `SESSION_TTL_SECONDS=604800` (7 días, D025), `AUTHORIZATION_TTL_SECONDS=300`, `HTTP_MAX_BODY_BYTES=2097152`, `DATABASE_URL` y `CORS_ORIGIN`. No declara las variables `LOGIN_RATE_LIMIT_*`, que toman su valor por defecto. Con `NODE_ENV=production` la cookie usa `Secure`. La lista completa de variables está en `08-manual-instalacion.md` (pendiente, F3).

Procedimiento de despliegue, reversión, copia de seguridad y restauración: `docs/operations/pilot-runbook.md`. En esta entrega, el resumen está en `07-manual-tecnico.md` (pendiente, F3).

## 8. Límites de la arquitectura

- El servidor provisional no es la API oficial de SEPSA.
- Excel se importa mediante scripts y migraciones. No es una dependencia de la interfaz ni la base definitiva.
- Las fotos se guardan en el dispositivo (IndexedDB) y en la tabla `evidence_assets` del servidor (Evidencias fotográficas). El piloto envía los bytes por `/v1/evidence/assets`; el servidor recalcula la huella SHA-256 y guarda el vínculo sin posibilidad de cambiarlo. La API oficial, los límites y la retención están pendientes (P-10, P-14).
- La autorización externa de corte es obligatoria en línea inmediatamente antes de la acción física. Sin conexión no se corta.
- El límite de intentos de acceso vive en la memoria de un solo proceso. Antes de tener varias réplicas se necesita un almacén compartido (P-11).
- El esquema no tiene límite de sesiones por dispositivo ni revocación por dispositivo (P-12, P-13).

## 9. Pendientes

Los pendientes de esta sección están en [14-pendientes-sepsa.md](14-pendientes-sepsa.md): P-10 (API oficial y retención de evidencia), P-11 (proveedor, topología, TLS, rotación de secretos, límite de intentos compartido y copias de seguridad), P-12 y P-13 (sesiones y revocación por dispositivo).

La integración oficial todavía no existe. Cuando SEPSA defina su API, este documento debe actualizarse en la misma tarea.

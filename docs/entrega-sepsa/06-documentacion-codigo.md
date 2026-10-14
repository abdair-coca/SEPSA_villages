# 06. Documentación del código fuente

Fuente: estructura de `backend/` y `field-app/`, tabla de rutas `backend/src/http/router.ts`, contrato OpenAPI y pruebas de arquitectura.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el código al 2026-10-12.

## 1. Estructura de carpetas

| Carpeta | Contenido |
|---|---|
| `field-app/` | Aplicación de campo y administración (React, TypeScript, Vite) |
| `backend/` | Servidor de la API (Node.js, TypeScript, PostgreSQL) |
| `backend/sql/` | Migraciones del esquema (`001` a `008`) y datos semilla |
| `backend/migrations/` | Carga de datos de prueba (manual) y migración de roles (al arrancar) |
| `backend/openapi/` | Contrato HTTP en OpenAPI |
| `.github/workflows/` | Integración continua |

## 2. Aplicación de campo (`field-app/src/`)

| Carpeta o archivo | Responsabilidad |
|---|---|
| `App.tsx`, `main.tsx`, `TechnicianRuntime.tsx` | Arranque, modo, sesión y pantalla según el rol |
| `domain/` | Tipos y reglas de negocio |
| `ports/`, `use-cases/` | Contratos y acciones: corte, reconexión, visita, sincronización, descarga y administración |
| `adapters/indexeddb/`, `adapters/http/` | Almacenamiento local durable y cliente del servidor |
| `adapters/browser/`, `adapters/mock/` | Conectividad, sesión, Service Worker y adaptadores simulados |
| `state/`, `bootstrap/` | Estado de la jornada y construcción según el modo |
| `screens/`, `components/` | `FieldApp` (técnico), `OperationsApp` (administrador), `LoginScreen` |

## 3. Servidor (`backend/src/`)

| Archivo o carpeta | Responsabilidad |
|---|---|
| `server.ts`, `config.ts`, `db.ts` | Arranque, configuración, conexión y transacciones |
| `http/` | Cabeceras, CORS, sesión, errores y tabla de rutas (`router.ts`) |
| `controllers/` | Un archivo por módulo. Solo HTTP; no ejecutan SQL |
| `services/` | Reglas de negocio y transacciones |
| `repositories/` | Solo SQL |
| `shared/`, `logging/` | Configuración, cifrado de contraseñas y tokens, límite de intentos, validación y eventos de seguridad |

Regla de dependencia: `controladores → servicios → repositorios → base de datos`. Excepción documentada: las consultas de morosos y de auditoría no tienen reglas de negocio, así que su controlador llama directamente al repositorio.

## 4. Rutas

El servidor tiene 24 rutas: 3 públicas y 21 con sesión. La tabla de rutas coincide con el contrato OpenAPI; su permiso por rol está en la apartado 5.1.

## 5. Convenciones y pruebas

- **Las capas no se saltan:** pruebas de arquitectura del servidor y de la app.
- **Tabla de rutas y OpenAPI coinciden:** prueba `router.test.ts`.
- **Invariantes comentados junto al código** (autorización de un solo uso, cola, idempotencia): revisión del código.
- **Códigos de error en inglés; mensajes al usuario en español:** pruebas del catálogo de errores.
- **Importes en centavos enteros:** revisión del código.

## 6. Discrepancias conocidas

- En la aplicación, 5 de 88 archivos no tienen el comentario de cabecera; en el servidor, todos lo tienen.
- El modo simulado solo existe en desarrollo o con la variable explícita.

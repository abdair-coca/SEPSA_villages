# Arquitectura actual

## CURRENT

```text
React/PWA
  ├─ dominio y políticas
  ├─ casos de uso / store
  ├─ repositorios IndexedDB
  └─ adaptadores local, simulado y HTTP
          │
          ▼
Backend piloto REST
  └─ autenticación, órdenes, autorización, sync y auditoría
          │
          ▼
PostgreSQL
```

## Frontend

`field-app/` contiene una aplicación React + TypeScript. `src/domain` define entidades y políticas; `src/application` contiene casos de uso; `src/app` compone el estado de la jornada; `src/ports` define interfaces; `src/adapters` conecta IndexedDB, navegador, simulación y HTTP; `src/ui` contiene las vistas de administración y campo.

La aplicación arranca en uno de estos modos:

- **Local/simulado:** sin `VITE_PILOT_BACKEND_URL`; autoridad y datos de demostración locales.
- **Piloto conectado:** con URL configurada o en el despliegue; `HttpPilotClient` usa el backend provisional.

El técnico mantiene su paquete, borradores, evidencias, operaciones y cola en IndexedDB. El estado React solo representa la vista actual.

## Backend y base de datos

`backend/` es un servidor HTTP Node.js/TypeScript con `pg`. Usa sesiones, roles `ADMIN` y `TECHNICIAN`, cookies/sesiones provisionales, transacciones PostgreSQL y auditoría. El origen se identifica como `PILOT_PROVISIONAL`.

El backend actual expone operaciones para:

- autenticación y cierre de sesión;
- consulta de técnicos, morosos y órdenes;
- creación individual y por lote;
- asignación con versión esperada;
- descarga de órdenes asignadas;
- autorización de corte;
- recepción y consulta de operaciones sincronizadas;
- consulta de auditoría.

Estos endpoints describen el piloto actual, no un contrato oficial de SEPSA.

## Flujo de datos

1. La UI invoca un caso de uso o servicio.
2. El dominio valida identidad, asignación, estado y datos de campo.
3. La operación se persiste de forma atómica en IndexedDB junto con su `operationId` y cola.
4. La UI confirma solo después de comprobar persistencia local.
5. El motor de sincronización envía la operación al adaptador remoto cuando la conectividad es utilizable.
6. El backend aplica idempotencia, autorización, conflictos y auditoría.
7. La cola conserva operaciones fallidas o inciertas para reintento seguro o revisión humana.

## Identidad y autorización

El frontend usa permisos para orientar la experiencia; el backend vuelve a validar la sesión y el rol. Un técnico solo recibe y opera órdenes asignadas a su identidad. Las sesiones remotas no deben convertirse en secretos persistidos en almacenamiento de la aplicación.

## Límites importantes

- El backend provisional no es la API oficial.
- Excel se importa mediante scripts/migraciones; no es una dependencia de la UI ni la base definitiva.
- Las fotos se conservan localmente y el sync actual envía referencias/metadatos, no bytes; el contrato oficial de almacenamiento y verificación queda pendiente.
- La autorización externa de corte es obligatoria online inmediatamente antes de la acción física.

## PLANNED

La API oficial de SEPSA, políticas definitivas de identidad, contrato de evidencia, integración de cobranza y validación de campo son trabajo futuro. No deben modelarse como componentes actuales ni como endpoints confirmados.

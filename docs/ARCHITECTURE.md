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

### UI compartida

La interfaz visual cruza los roles mediante un shell común. `src/ui/AppHeader.tsx` es el seam de presentación autenticado para Admin y Técnico: recibe identidad, título, descripción, contexto, un estado tipado y acciones como contenido. Renderiza la misma tarjeta superior responsive para ambos roles: marca por área, estado o entorno, avatar y menú de cuenta. El menú concentra nombre, rol, entorno cuando existe y cierre de sesión; no contiene reglas de autorización.

El estado del header conserva una separación explícita: Técnico muestra el estado real de conectividad (`positive`, `warning` o `negative`) que ya produce la jornada; Admin muestra el entorno de ejecución (`environment`) y no introduce una segunda lógica de conectividad. El nombre y rol no se duplican fuera del menú. El top bar no es fijo ni sticky y el título de página permanece debajo con el texto propio de cada superficie.

`src/ui/BrandLockup.tsx` comparte la marca con Login, mientras la lógica de permisos, sincronización, persistencia y operaciones permanece fuera de la UI. `context` y `actions` son slots de presentación existentes: el shell los posiciona, pero no interpreta ni modifica sus comportamientos.

Los patrones visuales compartidos deben tener una interfaz pequeña y más de un consumidor real. Paneles, estados, acciones, badges, formularios, modales y paginación se reutilizan cuando representan el mismo comportamiento. Las excepciones específicas del técnico móvil se mantienen acotadas a captura, teclado, GPS, evidencia, mapa y operación offline.

Los estilos tienen un punto de entrada en `src/ui/styles.css`. Los tokens visuales viven en `src/ui/styles/tokens.css` y el frame compartido en `src/ui/styles/shared-shell.css`; el resto de estilos se organiza por superficie hasta completar su migración. La hoja de estilos no contiene reglas de autorización ni de negocio.

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

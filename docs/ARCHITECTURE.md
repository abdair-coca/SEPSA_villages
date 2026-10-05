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

La interfaz visual cruza los roles mediante un shell común. `src/ui/AppHeader.tsx` es el seam de presentación autenticado para Admin y Técnico: recibe identidad, título, descripción, contexto, un estado tipado y acciones como contenido. Renderiza la misma tarjeta superior responsive para ambos roles: marca por área, estado o entorno, avatar y menú de cuenta. El shell tiene una variante `standard`, usada por Inicio y por Admin, y una variante `minimal`, usada por las pantallas secundarias del Técnico; esta última muestra solo el top bar y deja el encabezado propio de cada pantalla en su contenido. El menú concentra nombre, rol, entorno cuando existe y cierre de sesión; no contiene reglas de autorización.

El estado del header conserva una separación explícita: Técnico muestra el estado real de conectividad (`positive`, `warning` o `negative`) que ya produce la jornada; Admin muestra el entorno de ejecución (`environment`) y no introduce una segunda lógica de conectividad. El nombre y rol no se duplican fuera del menú. En las pantallas secundarias del Técnico, las acciones de sincronización se presentan como acciones tipadas dentro del menú de cuenta; sus callbacks siguen perteneciendo a `FieldApp` y no se implementan reglas operativas en `AppHeader`. El top bar no es fijo ni sticky y el título de página permanece debajo con el texto propio de cada superficie.

`src/ui/BrandLockup.tsx` comparte la marca con Login, mientras la lógica de permisos, sincronización, persistencia y operaciones permanece fuera de la UI. `context` y `actions` son slots de presentación existentes: el shell los posiciona, pero no interpreta ni modifica sus comportamientos.

Los patrones visuales compartidos deben tener una interfaz pequeña y más de un consumidor real. Paneles, estados, acciones, badges, formularios, modales y paginación se reutilizan cuando representan el mismo comportamiento. Las excepciones específicas del técnico móvil se mantienen acotadas a captura, teclado, GPS, evidencia, mapa y operación offline.

`SearchField` comparte búsqueda controlada y limpieza accesible entre Técnico y Admin. `PaginationControls` comparte las acciones de página; las cantidades y los cálculos siguen perteneciendo a cada vista. `AppStateCard` y `Notification` presentan estados y mensajes recuperables. `AppModal` monta los diálogos en un portal con el tema del rol: controla foco, teclado y bloqueo del fondo; `closeDisabled` impide cancelar mientras una operación administrativa está en curso. Los resultados de captura conservan su contenido y acción «Listo» con este mismo comportamiento.

Los estilos tienen un punto de entrada en `src/ui/styles.css`. Los tokens visuales y capas viven en `src/ui/styles/tokens.css`, el frame compartido en `src/ui/styles/shared-shell.css` y los controles compartidos en `src/ui/styles/controls.css`; el resto de estilos se organiza por superficie hasta completar su migración. La hoja de estilos no contiene reglas de autorización ni de negocio.

`npm run smoke:ui` complementa las pruebas de componentes con Chrome/CDP sobre un build simulado, usando un perfil temporal y sin contactar servicios externos. Captura vistas responsive y verifica foco, filtros, mapa, GPS tardío, desplazamiento de captura y restauración de borradores. `npm run smoke:pwa` verifica por separado el guardado local, cola y recuperación offline.

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
- habilitación provisional de reconexión;
- recepción y consulta de CUT, VISIT y RECONNECTION sincronizados;
- consulta de auditoría.

La sesión del navegador usa cookie HttpOnly `SameSite=Lax`, `Path=/`; no expone token en JSON ni almacenamiento frontend. `COOKIE_SECURE=true` o `NODE_ENV=production` activan `Secure` y HSTS. CORS compara origen exacto; POST de cookie exige Origin permitido y rechaza `Sec-Fetch-Site: cross-site`. `X-Request-Id` y cabeceras de seguridad salen en respuestas, incluidos errores y preflight. Rate limit de login usa dirección del socket y username normalizado, en memoria de proceso. No se confía en `X-Forwarded-For`.

Logs JSON/counters de eventos de login, autorización, sync/conflicto, evidencia y rechazos excluyen payloads, secretos, evidencia y datos personales. Límites de sesión por dispositivo no existen en el esquema: `TODO: VALIDAR CON SEPSA`. Rate limit distribuido, proveedor de métricas/alertas, umbrales, topología, TLS, rotación de secretos y backup/restore deben definirse para despliegue; provider y credenciales no están asumidos. Ver [Contrato del piloto](api/pilot-contract.md).

Estos endpoints describen el piloto actual, no un contrato oficial de SEPSA.

Contrato HTTP provisional, evidencia observada y pendientes: [Contrato del piloto](api/pilot-contract.md).

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
- Los blobs se conservan en IndexedDB. En el piloto, `EvidenceUploadPort` carga bytes por `/v1/evidence/assets`; servidor recomputa SHA-256 y guarda binding inmutable. CUT valida assets verificados antes de consumir autorización. API oficial, límites y retención siguen `TODO: VALIDAR CON SEPSA`.
- La autorización externa de corte es obligatoria online inmediatamente antes de la acción física.

## PLANNED

La API oficial de SEPSA, políticas definitivas de identidad, contrato de evidencia y validación de campo son trabajo futuro. No deben modelarse como componentes actuales ni como endpoints confirmados.

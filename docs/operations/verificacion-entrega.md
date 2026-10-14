# Lista de verificación de la entrega

Fuente: `.dev/PLAN.md` (criterios de aceptación de cada tarea), resultados de `docs/entrega-sepsa/11-resultados-pruebas.md` y verificaciones del 2026-10-12 y 2026-10-13.

Estados: **Cumplido** (evidencia registrada), **Parcial** (falta una parte, indicada), **Pendiente** (depende de una acción del usuario o de producción).

## Verificación de esta revisión (2026-10-13)

| Comprobación | Comando | Resultado |
|---|---|---|
| Pruebas de la app de campo | `npm test -- --run` en `field-app` | 45 archivos, 490 pruebas: pasan |
| Tipos | `npx tsc --noEmit` en `field-app` | Sin errores |
| Build de producción | `npm run build` en `field-app` | Correcto |
| Bundle de producción sin modo simulado (2.1) | Búsqueda de `seedE2eData`, `SIMULATED_AUTHORITY`, `dirección simulada`, `tech-camila`, `device-rugged-01` en `dist/assets/*.js` | Ninguna coincidencia |
| Guarda del build simulado | `npm run test:smoke-guard` | 1 de 1 |
| Humo de interfaz con build simulado | `VITE_PILOT_BACKEND_URL= VITE_ENABLE_SIMULATION=true npm run build`, luego `npm run smoke:ui` | Pasa |
| Humo de PWA y cola sin conexión | `npm run smoke:pwa` con el mismo build | Pasa |
| Build del backend | `npm run build` en `backend` | Correcto |
| Pruebas unitarias del backend | `npm run test:unit` en `backend` | 55 de 55 |
| OpenAPI | Lectura JSON de `openapi/pilot-provisional.openapi.json` | Válido |

No ejecutado en esta revisión: `npm test` del backend y `npm run e2e:browser`, que requieren una base PostgreSQL de prueba. La última ejecución registrada, con PostgreSQL local, está en `11-resultados-pruebas.md`.

## Por tarea

### Fase 0: seguridad, despliegue y bloqueos

| Tarea | Estado | Evidencia |
|---|---|---|
| 0.1 Contraseñas de Neon sin `password123` | Pendiente | Lo verifica el responsable en Neon. |
| 0.2 Arranque sin cambios en un segundo arranque | Cumplido | `fc8e022`; D026: la carga de datos ya no corre al arrancar. |
| 0.3 Guarda de base local en el E2E | Cumplido | `418c526`; `backend/scripts/local-database-guard.mjs`. |
| 0.4 Origen de la API | Cumplido | Producción, 2026-10-12: `OPTIONS` ajeno 403 `CORS_ORIGIN_REJECTED`; `POST` ajeno 403 `CSRF_ORIGIN_REJECTED`; origen propio correcto. |
| 0.5 Salud y forma del error | Parcial | Producción, 2026-10-12: `/healthz` 200. Falta comprobar la respuesta tras una suspensión de Neon. |
| 0.6 Secretos y URL del backend | Parcial | Git solo versiona `.env.example`. Vercel sin variables. Falta revisar el panel de Render. |
| 0.7 Plan gratuito | Cumplido | Explicado en la guía de evaluación (`guia-evaluacion.md`) y en la entrega. |
| 0.8 Tamaño de la foto (D018) | Parcial | `93249af`; pruebas unitarias y E2E con imagen de 5 MP. Falta una foto real de móvil sincronizada en producción. |

### Fase 1: corte y reconexión

| Tarea | Estado | Evidencia |
|---|---|---|
| 1.1 Consumo inmediato del corte (D020) | Cumplido | `b774eae`, `21725dd`; `backend/test/cut-consume.integration.test.ts`. |
| 1.2 Reintento del consumo con el mismo `operationId` (D019) | Cumplido | `443d579`; pruebas de reconexión y de cola. |
| 1.3 Nueva autorización sin recaptura (D022) | Cumplido | `620cb85`; botón **Solicitar nueva autorización/habilitación**. |
| 1.4 Cola: verificar en vez de reintentar | Cumplido | `7ba1c63`; botón **Verificar con servidor**. |
| 1.5 Corrección de datos por el técnico (D-c) | Cumplido como limitación | No se implementa; se declara en la entrega (`docs/entrega-sepsa/README.md`). |
| 1.6 Pruebas E2E de corte y reconexión | Parcial | `48e0af5`; `e2e:browser` con 10 comprobaciones: visita sin conexión, recarga, corte con respuesta perdida reintentada, reconexión, evidencia en PostgreSQL. Doble toque: corregido en `7354101`; la prueba está en `store.test.tsx` (capa de estado), sin prueba de navegador. **Dos dispositivos**: sin prueba automatizada; el servidor rechaza un consumo con otro dispositivo (`reconnection.test.ts`). |
| 1.7 Foto de la visita | Cumplido en código | `55a9ee3`. Falta comprobar en producción que una visita con foto queda en `evidence_assets`. |

### Fase 2: aplicación completa

| Tarea | Estado | Evidencia |
|---|---|---|
| 2.1 Sin modo simulado en producción (D023) | Cumplido | `444e1b0`, `28ab448`; la búsqueda de cadenas en el bundle de producción no encuentra ninguna; el paso de CI lo comprueba. |
| 2.2 Textos visibles | Cumplido | `7a4fa57`, `28ab448`; la ficha de la orden ya no muestra la fuente. |
| 2.3 Nombre del servicio | No solicitado | Opcional; solo si el usuario lo pide. |
| 2.4 Catálogo de errores y duración de sesión | Cumplido | `215c09e`, `978b4bd`. La sesión dura 7 días (D025), que sustituye a las 14 horas del plan. |
| 2.5 Vista de conciliación del administrador (D024) | Cumplido | `d9fe995`; solo lectura. |
| 2.6 E2E del flujo completo | Cumplido | `48e0af5`: administrador, técnico, sincronización y auditoría. |

### Fase 3: calidad

| Tarea | Estado | Evidencia |
|---|---|---|
| 3.1 Rendimiento | Cumplido | `1ac10bc`. Build actual: el fragmento más grande pesa 271 kB; ningún fragmento supera 500 kB. |
| 3.2 Teléfono (360 y 390 px) | Cumplido | `smoke:ui` captura las vistas en ambos anchos. |
| 3.3 Accesibilidad básica | Cumplido | `064df90`. |
| 3.4 Textos revisados por una persona no técnica | Pendiente | Lo hace el usuario. |
| 3.5 Guía de evaluación | Cumplido | `docs/operations/guia-evaluacion.md`. |

### Fase 4: verificación y entrega

| Tarea | Estado | Evidencia |
|---|---|---|
| 4.1 Lista de verificación | Cumplido en esta revisión | Este documento. Las filas Pendiente o Parcial se cierran antes de la entrega. |
| 4.2 Revisión de seguridad | Cumplido | `82de04e`, `9aab89e`; permisos y sesiones en `permissions.integration.test.ts`. Límites declarados: intentos de acceso por proceso, caducidad sin inactividad. |
| 4.3 Respaldo de Neon | Pendiente | Lo crea el usuario en Neon antes de la entrega. |
| 4.4 Documento de entrega | Cumplido | `docs/entrega-sepsa/README.md`, sección de limitaciones. |

## Pendientes para el usuario

1. Revisar en Neon 0.1 y crear el respaldo de 4.3.
2. Revisar en el panel de Render las variables de 0.6 y confirmar que `CORS_ORIGIN` es el dominio de Vercel.
3. Sincronizar en producción una foto real de móvil (0.8) y una visita con foto (1.7).
4. Pedir a una persona no técnica la revisión de textos (3.4).
5. Decidir si `e2e:browser` y `npm test` del backend se ejecutan contra una base de prueba antes de la entrega.

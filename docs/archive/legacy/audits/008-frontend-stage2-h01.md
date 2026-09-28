# Etapa 2, H-01 — Auto-sincronización al recuperar conexión

**Alcance:** únicamente H-01 de [`008-frontend.md`](008-frontend.md). No se modificaron estilos, coordenadas del mapa, backend, dominio, permisos, contratos ni persistencia de la cola.

## Diagnóstico

El smoke reproducía el fallo después de recargar la PWA sin conexión:

1. `BrowserConnectivity` se inicializaba en `offline` según `navigator.onLine`.
2. El store técnico comenzaba con el modo del adaptador simulado `online`.
3. `subscribe()` no entregaba el modo actual al nuevo suscriptor; la primera sonda ya estaba en `offline` y no producía una notificación adicional.
4. Al recuperar conexión, el adaptador notificaba `online`, pero el store ya creía estar online. No detectaba una transición desde `offline` y no solicitaba `sync()`.
5. El envío manual sí sincronizaba la visita, por lo que la cola y el motor no eran la causa del fallo.

## Cambio

`field-app/src/adapters/browser/connectivity.ts` ahora notifica el modo actual al registrar un suscriptor. El callback está protegido para que una excepción del consumidor no interrumpa el monitoreo ni la suscripción.

Se añadió una regresión en `field-app/src/adapters/browser/connectivity.test.ts` que reproduce un navegador inicialmente offline y exige recibir `offline` al suscribirse.

## Antes y después

| Comprobación | Antes | Después |
| --- | --- | --- |
| Smoke PWA tras recarga offline y reconexión | `automaticallySynced: false`; `manualSyncUsed: true` | `automaticallySynced: true`; `manualSyncUsed: false` |
| Evento browser `online` | 1 | 1 |
| Visita nueva en la cola | 1 pendiente; luego 1 sincronizada manualmente | 1 pendiente; luego 1 sincronizada automáticamente |
| Duplicados | No observados | No observados |
| Suite completa | 18 archivos, 184 pruebas antes del cambio | 18 archivos, 185 pruebas; pasa |
| Build simulado | Fallo de auto-sync en smoke | Pasa; 77 módulos |
| JS principal sin gzip | 468 640 B de referencia H-02 | 468 670 B |
| CSS principal sin gzip | 207 587 B | 207 587 B |

Los tamaños se obtuvieron con `npm run build` usando `VITE_PILOT_BACKEND_URL` vacío solo para ese proceso. El cambio no es una optimización de bundle; el CSS permanece sin cambios.

## Validación reproducible

Desde `field-app`:

```powershell
$env:VITE_PILOT_BACKEND_URL = ''
npm test -- --run src/adapters/browser/connectivity.test.ts
npm run build
npm run smoke:pwa
npm test -- --run --maxWorkers=1 --no-file-parallelism
```

Resultados observados:

- regresión: 5 pruebas, pasa;
- build: pasa;
- smoke PWA: pasa con `automaticallySynced: true`, `manualSyncUsed: false` y una sola operación `synced`;
- suite completa: 18 archivos, 185 pruebas, pasa.

El smoke todavía informa que no pudo eliminar un perfil temporal de Chrome (`EPERM`), pero no altera el resultado funcional ni el código del repositorio.

## Límites

La evidencia valida el modo simulado local de la PWA. No prueba la configuración de producción ni atribuye ningún comportamiento al backend. La aceptación final de la etapa 2 y los hallazgos H-03 a H-10 siguen pendientes.

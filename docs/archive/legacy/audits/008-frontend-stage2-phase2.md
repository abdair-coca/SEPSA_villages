# Etapa 2 — Cierre de hallazgos frontend aplicables

Esta entrega completa los hallazgos frontend aprobados H-03, H-04, H-05, H-06, H-08 y H-10. H-07 y H-11 ya estaban cerrados en [`008-frontend-stage2-map.md`](008-frontend-stage2-map.md). H-09 permanece pendiente porque requiere alinear el origen del despliegue/backend, expresamente fuera del alcance frontend.

## Cambios verificables

| Hallazgo | Cambio | Evidencia |
| --- | --- | --- |
| H-03 | Se eliminó únicamente el bloque `.field-app .app-header` base que repetía la regla final y quedaba sobrescrito. Se conservaron las reglas responsive, de estado y de `:has`. | `rg -n -U "\\.field-app \\.app-header \\{" src/ui/styles.css` deja una regla base y sus overrides; no hubo cambio de coordenadas ni rediseño. |
| H-04 | El diálogo fullscreen guarda el control que lo abrió, enfoca el cierre al entrar, mantiene Tab/Shift+Tab dentro del diálogo, cierra con Escape y devuelve el foco al abrirse de nuevo. | `src/ui/FieldMap.test.ts`: navegación en ambos sentidos, Escape y fallback de restitución. |
| H-05 | La campana administrativa conserva exactamente sus clases y aspecto, pero deja de anunciar una función inexistente: `aria-hidden="true"`, sin `role="img"` ni etiqueta de notificaciones. | `src/ui/AppHeader.test.tsx` comprueba la semántica renderizada. |
| H-06 | Se retiró `IconPhone` después de confirmar que no tenía consumidores en el código del repositorio. | `rg -n "IconPhone" field-app/src` no devuelve referencias; las menciones históricas de auditoría se conservan en `docs`; TypeScript y build pasan. |
| H-08 | El build emite un marcador explícito de modo (`smoke-build.json`); el smoke exige variable vacía, marcador válido y coincidencia byte a byte entre `dist` y `vite preview`. | `scripts/smoke-build.test.mjs`: 1 test; build simulado y smoke local pasan. |
| H-10 | Se añadieron pruebas de estructura/semántica del header, popup seguro, foco fullscreen, guard del build y cascada CSS revisada. | Suite completa: 19 archivos, 190 pruebas. |

## Validación ejecutada

Desde `field-app`:

```powershell
npm test -- --run
npm run test:smoke-guard
$env:VITE_PILOT_BACKEND_URL = ''
npm run build
npm run smoke:pwa
git diff --check
```

Resultados de esta ejecución:

- suite Vitest: **19 archivos, 190 pruebas, pasa**;
- guard Node del smoke: **1 test, pasa**;
- build simulado: **pasa**, 77 módulos transformados;
- salida sin gzip: JavaScript principal **470.29 kB**, CSS principal **207.46 kB**;
- smoke de navegador: Service Worker activo/controlado, shell completo, una visita offline persistida y una sola visita sincronizada al reconectar (`automaticallySynced: true`, `manualSyncUsed: false`);
- `git diff --check`: **pasa**.

El smoke local simulado de esta ejecución no sustituye la reproducción de auto-sync reportada por el usuario en otro recorrido/entorno. Esa discrepancia permanece registrada; esta fase no añadió otro arreglo especulativo de sincronización.

## Límites y exclusiones

- No se modificaron estilos calculados intencionalmente, coordenadas, selección de órdenes, dominio, permisos, contratos, IndexedDB, cola, backend ni despliegue.
- H-09 sigue abierto: la corrección requiere confirmar el dominio canónico y ajustar `CORS_ORIGIN` en despliegue, fuera de esta fase.
- La prueba de H-04 es focalizada a los handlers de teclado y restitución; la revisión manual en dispositivo real sigue siendo recomendable.
- La aceptación 2.9 queda pendiente hasta que el usuario confirme la comparación antes/después.

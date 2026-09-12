# Tareas: Prototipo de campo offline para cortes y reconexiones

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | 900–1200 |
| Riesgo presupuesto 400 líneas | Alto |
| PR encadenadas | Sí |
| División | Unidad 1 → Unidad 2 → Unidad 3 |
| Estrategia | auto-chain |
| Cadena | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Unidades de trabajo

| Unidad | Objetivo | Prueba enfocada | Runtime | Rollback |
|---|---|---|---|---|
| 1 | Scaffold, dominio y políticas | `npm --prefix field-app test -- --run src/domain src/application/process.integration.test.ts` | N/A: dominio sin UI | Eliminar configuración, `src/domain/**`, `src/ports/**` y tests de proceso |
| 2 | IndexedDB, mocks, autorización y sync | `npm --prefix field-app test -- --run src/adapters src/application` | N/A: integración cubierta por Vitest | Eliminar `src/adapters/**`, `src/application/**` y tests de integración |
| 3 | UI móvil y PWA | `npm --prefix field-app test -- --run src/ui` y `npm --prefix field-app run build` | `npm --prefix field-app run preview -- --host 127.0.0.1` | Eliminar `src/app/**`, `src/ui/**`, estilos, `public/**` y `src/main.tsx` |

## Fase 1: Scaffold y dominio

- [ ] 1.1 Crear configuración React 19, TypeScript, Vite 7 y Vitest en `field-app/`.
- [ ] 1.2 RED: timeout o `unknown` bloquea acción y registra visita `pending`.
- [ ] 1.3 RED: autorización consumida rechaza segunda ejecución.
- [ ] 1.4 RED: respuesta perdida marca `PHYSICAL_UNKNOWN` y exige `lookup(operation_id)`.
- [ ] 1.5 RED: mismo `operation_id` no produce duplicado.
- [ ] 1.6 Implementar dominio: asignación, estados, evidencia, visitas e inmutabilidad; excluir pagos, lecturas y GPS.
- [ ] 1.7 Definir puertos de autorización, repositorio, sincronización y conectividad; probar políticas.

## Fase 2: Persistencia e integración

- [ ] 2.1 Crear IndexedDB con transacción multi-store, paquete íntegro/versionado y cola durable.
- [ ] 2.2 Crear adapters mock con modos `online`, `weak` y `offline`, sin contrato SEPSA ficticio.
- [ ] 2.3 Implementar corte, reconexión, autorización y sync: intención previa, vigencia, reintentos, consulta y conflictos.
- [ ] 2.4 Probar reinicio, cola, idempotencia, `PHYSICAL_UNKNOWN`, deduplicación y trazabilidad.
- [ ] 2.5 Probar reconexión solo desde `EJECUTADO` y ausencia de cobros.

## Fase 3: UI, PWA y runtime

- [ ] 3.1 Crear store y UI móvil: órdenes, búsqueda, detalle, visita, corte y reconexión.
- [ ] 3.2 Mostrar evidencia, excepción justificada, estados y mensajes accionables; no solicitar GPS.
- [ ] 3.3 Crear manifest, Service Worker y registro manual; cachear shell sin CDN.
- [ ] 3.4 Probar UI offline, bloqueos, persistencia visual, cola y ausencia de pagos.
- [ ] 3.5 Ejecutar build y prueba manual: instalación, reinicio, red intermitente, duplicado y conciliación.

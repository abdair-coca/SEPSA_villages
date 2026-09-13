# Tareas: Piloto multirol de corte vertical

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | 700–1.000 |
| Riesgo presupuesto 400 líneas | High |
| PRs encadenados | Sí; 3 slices |
| Estrategia | auto-chain; stacked-to-main |
| Decisión previa | No |
| PRs ahora | No; solo slices locales |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Unidades de trabajo

| Unidad | Objetivo | Pruebas enfocadas | Runtime harness | Rollback |
|---|---|---|---|---|
| 1 / PR 1 | Dominio, autoridad demo, identidad/RBAC | `npm test -- --run src/domain src/application/auth.test.ts src/adapters/indexeddb/authority-repository.integration.test.ts` | Login → búsqueda → crear/asignar → auditoría | Revertir dominio, autoridad y auth; conservar cambio 002 |
| 2 / PR 2 | Persistencia, captura, casos de uso, sync | `npm test -- --run src/application src/adapters/indexeddb` | Offline → captura → reinicio → sync simulado | Revertir persistencia/captura/sync; conservar contratos PR 1 |
| 3 / PR 3 | UI multirol, runtime, PWA E2E | `npm run smoke:pwa` | Chrome: admin → técnico → offline → captura → reload | Revertir shells, runtime y smoke; conservar PR 1–2 |

## Fase 1: Unidad 1 — Dominio y autoridad demo

- [x] 1.1 RED: probar en `policies.test.ts`, `auth.test.ts` y `authority-repository.integration.test.ts` que orden ajena y elevación de rol fallan sin modificar datos.
- [x] 1.2 RED: probar duplicados, reintentos idempotentes y versiones obsoletas en `authority-repository.integration.test.ts`.
- [x] 1.3 Implementar roles, permisos, contexto y comandos versionados en `domain/types.ts`, `policies.ts`, `ports/identity.ts`, `authority.ts` e `index.ts`.
- [x] 1.4 Crear `authority-repository.ts`, `application/auth.ts`, `admin.ts` y `download.ts`: seed `SIMULATED`, sesión, RBAC, búsqueda, creación/asignación, auditoría y descarga filtrada.

## Fase 2: Unidad 2 — Persistencia y operación

- [x] 2.1 RED: cubrir pago concurrente, timeout/unknown, consumo perdido, `PHYSICAL_UNKNOWN`, lookup y no repetición en pruebas de proceso/sync.
- [x] 2.2 RED: cubrir orden ajena, fallo atómico, bypass GPS injustificado, bypass fotográfico sin justificación, lectura ausente, medidor incorrecto y precisión GPS inválida.
- [x] 2.3 Modificar `database.ts`, `repository.ts`, `process.ts`, `visit.ts`, `sync.ts`; implementar captura completa, intención, atomicidad, cola y autoridad simulada mediante puertos/adapters.
- [x] 2.4 Hacer pasar RED conservando auditoría, versiones, estados físico/sync separados, recuperación incierta y errores accionables.

## Fase 3: Unidad 3 — UI, runtime y PWA

- [x] 3.1 RED: cubrir login rechazado, shells por rol, aislamiento, contexto offline, captura y reload en pruebas de UI/store/smoke.
- [x] 3.2 Modificar `runtime.ts`, `store.ts`, `FieldApp.tsx`, `styles.css` y `App.tsx`: shells, sesión, dashboard, jornada, captura y estados sin pagos ni lotes.
- [x] 3.3 Actualizar `pwa.ts` y `pwa-smoke.mjs`: flujo Chrome completo, offline real y baseline de arranque/listado/búsqueda sobre seed acotado.

## Fase 4: Verificación integrada

- [x] 4.1 Ejecutar `npm test -- --run`, `npm run build` y `npm run smoke:pwa`; confirmar `package.json` sin dependencias nuevas.
- [x] 4.2 Verificar trazabilidad completa y límites: sin lotes ni API/backend SEPSA; conservar cambio 002.

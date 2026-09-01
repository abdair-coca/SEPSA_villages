# Tareas: Prototipo UI/UX navegable de cobranza eléctrica rural

## Previsión de carga de revisión

Líneas estimadas: 700–1000. PR encadenados sugeridos (feature-branch-chain, 3 unidades).

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Unidades de trabajo sugeridas

| Unidad | Meta | PR | Prueba | Runtime | Reversión |
|--------|------|-----|--------|---------|-----------|
| 1 | Esqueleto: `index.html` + `styles.css` + navegación | PR 1 | Abrir `index.html`, recorrer 4 secciones | Navegador móvil/desktop | Borrar `boceto-mvp/` |
| 2 | Dominio + store + datos semilla + flujo de cobro | PR 2 | Funciones puras de dominio; flujo cobro offline | Navegador, toggle offline | Revertir módulos dominio/store de `app.js` |
| 3 | Sync simulada + historial + persistencia | PR 3 | Recargar página, verificar persistencia; sync 100% | Navegador, modo online | Revertir sync + cola |

## Fase 1: Fundación

- [ ] 1.1 Crear `boceto-mvp/index.html` con estructura semántica y bottom nav (Inicio, Domicilios, Cobros, Más).
- [ ] 1.2 Crear `boceto-mvp/styles.css` con sistema visual claro, tarjetas, botones grandes y frame móvil en desktop.
- [ ] 1.3 Crear `boceto-mvp/app.js` con router de pantallas y render de las 11 vistas (estáticos).

## Fase 2: Dominio y datos

- [ ] 2.1 Implementar módulo de dominio: validación meses completos y meses más antiguos primero.
- [ ] 2.2 Implementar cálculo de total en centavos y decremento de deuda tras cobro.
- [ ] 2.3 Crear datos semilla de 10–20 domicilios cubriendo todos los escenarios del spec.
- [ ] 2.4 Implementar store con IndexedDB (fallback localStorage) para datos locales y cola.

## Fase 3: Flujo de cobranza

- [ ] 3.1 Pantalla de inicio con conteos y estado de conexión (spec R-Inicio).
- [ ] 3.2 Lista de domicilios con buscador, filtros y estados (spec R-Domicilios).
- [ ] 3.3 Detalle del domicilio con deuda destacada y acciones Visita/Cobrar (spec R-Detalle).
- [ ] 3.4 Registro de visita con observación opcional y confirmación (spec R-Visita).
- [ ] 3.5 Cobranza: selector entero de meses, lista de meses aplicados, total (spec R-Selección).
- [ ] 3.6 Confirmación de cobro con método Efectivo y advertencia (spec R-Confirmación).
- [ ] 3.7 Pantalla de pago registrado con deuda restante y estado de sync (spec R-Pago).
- [ ] 3.8 Comprobante con ID único `CP-YYYYMMDD-NNNNNN` y acciones simuladas (spec R-Comprobante).
- [ ] 3.9 Historial de cobros con estados Sincronizado/Pendiente (spec R-Historial).

## Fase 4: Offline y sincronización

- [ ] 4.1 Toggle "Simular modo offline" y contador de cambios pendientes (spec R-Offline).
- [ ] 4.2 Persistencia: cobro/visita sobreviven recarga de página (spec R-Persistencia).
- [ ] 4.3 Sync simulada con progreso, estados y reintentos sin pérdida (spec R-Sync).

## Fase 5: Verificación y limpieza

- [ ] 5.1 Probar dominio: 0, 1, varios, todos los meses, fracciones rechazadas (spec R-Selección).
- [ ] 5.2 Probar flujo completo offline → cobro → comprobante → recarga → sync.
- [ ] 5.3 Verificar responsive en Android vertical y desktop.
- [ ] 5.4 Revisar acceso de domicilios: solo los asignados al técnico.
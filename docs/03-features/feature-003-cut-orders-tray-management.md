---
title: "Feature F-003: Gestión y Monitoreo de Bandeja de Cortes"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../07-ui/screens/P-03-cut-tray.md"
  - "../../01-domain/entities/cut-order.md"
---

# F-003: Gestión y Monitoreo de Bandeja de Cortes

## Objetivo

Visualizar, filtrar y priorizar las órdenes de corte activas en estado `GENERADO` asignadas a cuadrillas técnicas.

## Actor

Supervisor de Cortes / Liniero en Terreno.

## Comportamiento y Campos Calculados

- **Contador Superior**: Badge numérico destacado (observado valor `46` registros).
- **Cálculo de Antigüedad**: `dias_desde_generacion = DATEDIFF(NOW(), fecha_generacion)` (mostrado con decimales, ej. `9.21 días`).
- **Filtros de Cabecera**: Búsqueda por Cuenta, Medidor, Ruta, Técnico y Regional.
- **Pestaña Cartográfica**: Conmutación directa a vista de mapa satelital web.

## Casos de Prueba Potenciales (TDD)

- `TC-F003-01`: Cálculo dinámico de días transcurridos desde la fecha de generación.
- `TC-F003-02`: Filtrado exacto por número de medidor o cuenta.

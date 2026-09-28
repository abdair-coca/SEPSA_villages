---
id: "BR-002"
title: "Exclusión de Intereses en Listados de Morosidad"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "BR-001-minimum-threshold.md"
  - "../../03-features/feature-001-filter-delinquent-customers.md"
---

# BR-002: Exclusión de Intereses en Listados de Morosidad

## Regla

Los montos monetarios calculados y exhibidos en las consultas y bandejas de morosidad corresponden exclusivamente a la suma del capital de las planillas impagas y **no incluyen intereses penales ni compensatorios**, dado que estos se liquidan dinámicamente al día exacto del cobro en ventanilla.

## Entidades Afectadas

- `FACTURA_DEUDA`
- `ORDEN_CORTE` (`deuda_mes_tope`)

## Evidencia Visual

Banner en P-02: *"Los montos en los resultados no incluyen cálculos de intereses ya que estos varían día a día"*. Minuto 00:45.

## Casos de Prueba (TDD)

- `TC-BR-002-01`: Verificar que `total_pendiente` en búsqueda coincida exactamente con `SUM(monto_factura)` sin recargos.

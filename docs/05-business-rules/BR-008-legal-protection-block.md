---
id: "BR-008"
title: "Impedimento de Suspensión por Protección Legal"
type: "business-rule"
status: "inferred"
confidence: "high"
source: "master-analysis"
related:
  - "../../01-domain/entities/cut-order.md"
  - "../../07-ui/screens/P-04-cut-file.md"
---

# BR-008: Impedimento de Suspensión por Protección Legal

## Regla

La existencia de **reclamos formales regulatorios no resueltos** o de un **convenio / plan de pagos vigente** impide legalmente la suspensión física del servicio eléctrico, bloqueando la emisión de órdenes de corte para ese suministro.

## Entidades Afectadas

- `CUENTA_SUMINISTRO`
- `ORDEN_CORTE`

## Evidencia Visual

Indicadores booleanos explícitos de salvaguarda en la ficha P-04:
- `Tiene Reclamos: NO`
- `Plan de Pago: NO`

## Casos de Prueba (TDD)

- `TC-BR-008-01`: Excluir de la búsqueda de corte a suministros con reclamos activos o plan de pagos activo.

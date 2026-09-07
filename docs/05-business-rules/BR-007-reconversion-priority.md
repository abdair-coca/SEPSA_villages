---
id: "BR-007"
title: "Prioridad de Reconversión / Otros Ingresos"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-006-reconnection-management.md"
  - "../../01-domain/entities/reconnection.md"
---

# BR-007: Prioridad de Reconversión / Otros Ingresos

## Regla

Si una cuenta suspendida registra saldos o conceptos pendientes en el rubro contable **"Otros Ingresos"** (costos arancelarios de corte y reposición), el sistema exige registrar y liquidar administrativamente la reconversión antes de permitir el restablecimiento definitivo.

## Entidades Afectadas

- `ORDEN_CORTE`
- `REHABILITACION_RECONEXION`

## Evidencia Visual

Mensaje explícito en ficha P-04 (minuto 12:15): *"Aun existen registros en OTROS INGRESOS para este corte debe realizarse la reconversión primero"*.

## Casos de Prueba (TDD)

- `TC-BR-007-01`: Bloquear finalización de reconexión si existen registros pendientes en Otros Ingresos.

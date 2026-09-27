---
title: "Flujo de Trabajo TDD (Test Driven Development)"
type: "development"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "sdd-workflow.md"
  - "../../05-business-rules/README.md"
---

# Flujo de Trabajo TDD (Test Driven Development)

## Convención de Nomenclatura de Pruebas

Toda suite de pruebas unitarias o de integración debe vincularse directamente a una regla de negocio o funcionalidad:

- **Reglas de Negocio**: `TC-BR-{ID}-{NUM}` (ej. `TC-BR-001-01`).
- **Funcionalidades**: `TC-F{NUM}-{SUB}` (ej. `TC-F001-01`).
- **Flujos**: `TC-FLOW-{NUM}-{SUB}` (ej. `TC-FLOW-003-01`).

## Protocolo Red-Green-Refactor

1. **Red**: Escribir la prueba unitaria que verifica la regla de negocio antes de escribir la lógica del endpoint o componente.
   - *Ejemplo*: Verificar que una orden en estado `GENERADO` pase a `ANULADO` al invocar el webhook de pago con timestamp.
2. **Green**: Implementar la solución mínima y suficiente que haga pasar la prueba.
3. **Refactor**: Limpiar el código manteniendo el cumplimiento de los criterios de aceptación.

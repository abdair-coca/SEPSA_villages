---
title: "Feature F-005: Anulación Automática por Cobranza Concurrente"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
  - "../../01-domain/entities/cut-order.md"
---

# F-005: Anulación Automática por Cobranza Concurrente

## Objetivo

Garantizar la protección del usuario y eliminar suspensiones improcedentes cuando un cliente paga sus planillas pendientes en ventanilla mientras una orden de corte se encuentra emitida.

## Actor

Proceso Automatizado / Cajero Comercial.

## Flujo Principal

1. El cliente abona en caja o banco las planillas vencidas de su cuenta.
2. El sistema de cobros asienta el pago (factura pasa a estado `C`).
3. Un trigger o evento de integración inspecciona si existe una orden en estado `GENERADO` para esa cuenta.
4. Si existe, la orden cambia inmediatamente a estado `ANULADO`.
5. Se registra la auditoría en `motivo_anulacion`: `"Anulado ya que pago parte o la totalidad de facturas vencidas, Fecha de pago: [DD-MM-YYYY HH:mm:ss]"`.
6. En la ficha `P-04`, el badge cambia a `ESTADO: ANULADO` y se bloquea el botón de corte efectivo.

## Casos de Prueba Potenciales (TDD)

- `TC-F005-01`: Transición automática a ANULADO ante evento de pago.
- `TC-F005-02`: Inserción del texto de auditoría con fecha y hora del cobro.
- `TC-F005-03`: Deshabilitación del botón 'Registrar corte efectivo' si la orden está ANULADA.

---
id: "BR-003"
title: "Anulación Automática de Orden por Cobranza Concurrente"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-005-concurrent-payment-cancellation.md"
  - "../../04-flows/flow-003-concurrent-payment-auto-cancellation.md"
  - "../../01-domain/entities/cut-order.md"
---

# BR-003: Anulación Automática de Orden por Cobranza Concurrente

## Regla

Si una orden de corte se encuentra en estado `GENERADO` y el cliente cancela parte o la totalidad de las facturas vencidas en el sistema de cobros o bancos, la orden transiciona **automática e inmediatamente** al estado `ANULADO`, registrando la fecha, hora exacta y causa del pago para evitar el corte indebido en terreno.

## Entidades Afectadas

- `ORDEN_CORTE` (`estado_corte = 'ANULADO'`, `motivo_anulacion`)
- `FACTURA_DEUDA`
- `CUENTA_SUMINISTRO`

## Evidencia Visual

Observada en la ficha `/corte/443797` (minuto 07:42): *"Anulado ya que pago parte o la totalidad de facturas vencidas, Fecha de pago: 02-09-2026 16:20:13"*.

## Casos de Prueba (TDD)

- `TC-BR-003-01`: Transición automática de GENERADO a ANULADO tras asentar pago en caja.
- `TC-BR-003-02`: Grabación del texto exacto de auditoría con timestamp en `motivo_anulacion`.
- `TC-BR-003-03`: Bloqueo estricto del botón de corte en terreno para órdenes ANULADAS.

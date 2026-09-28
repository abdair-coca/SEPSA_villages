---
title: "M2: Cobros y Kardex Comercial"
type: "module"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../07-ui/screens/P-06-customer-kardex.md"
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
  - "../../05-business-rules/BR-006-tax-id-mandatory-regularization.md"
---

# M2: Cobros y Kardex Comercial (`cobros.sepsa.web.bo`)

## Propósito

Módulo comercial y financiero responsable de la recaudación en ventanillas de SEPSA y de la auditoría histórica de los clientes.

## Pantalla Asociada

- **[P-06 Kardex Integral del Cliente](../../07-ui/screens/P-06-customer-kardex.md)** (`/kardex`).

## Funcionalidades y Reglas Críticas

1. **Gestión de Cajas**: Identificación del cajero y punto de venta (ej. Caja `SP-JDQT`, `SEPSA URBANO`).
2. **Validación Fiscal Inmediata**: Si la cuenta consultada no registra Cédula de Identidad o NIT, interrumpe el flujo con una alerta modal bloqueante urgente ([BR-006](../../05-business-rules/BR-006-tax-id-mandatory-regularization.md)).
3. **Auditoría de Planillas**: Tabla cronológica que distingue facturas pagadas (`C` en verde) de facturas pendientes (`P` en rojo) con sus lecturas en kWh y fechas de pago.
4. **Desencadenante de Anulación**: Al asentar el cobro de una planilla vencida sujeta a corte, notifica al módulo M1 para ejecutar la regla [BR-003](../../05-business-rules/BR-003-concurrent-payment-cancellation.md).

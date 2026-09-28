---
title: "Entidad: Factura / Planilla de Deuda"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "account.md"
  - "cut-order.md"
  - "../../05-business-rules/BR-001-minimum-threshold.md"
  - "../../05-business-rules/BR-002-interest-exclusion.md"
---

# Factura / Planilla de Deuda (`FACTURA_DEUDA`)

## Propósito

Modela el desglose cronológico mensual de planillas emitidas y adeudadas que sustentan legal y financieramente la emisión del corte.

## Descripción

Proviene del origen contable `FA_FACTURAS`. Cada registro representa un periodo facturado (mes y año), con fecha de emisión, importe exigible en Bolivianos, estado de recaudación (`P` = Pendiente, `C` = Cancelado) y días de antigüedad de la mora.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `cuenta_id` | Integer [FK] | Suministro facturado | FK a `CUENTA_SUMINISTRO` | [CONFIRMADO VISUALMENTE] |
| `periodo_anio` | Integer | Año fiscal del consumo | Ej. 2026 | [CONFIRMADO VISUALMENTE] |
| `periodo_mes` | Integer | Mes facturado | Entero 1 a 12 (ej. 6, 7, 8) | [CONFIRMADO VISUALMENTE] |
| `monto_factura` | Decimal(12,4) | Monto facturado exigible en Bs | Ej. 21.94 Bs, 66.82 Bs | [CONFIRMADO VISUALMENTE] |
| `fecha_facturacion` | Timestamp | Fecha formal de emisión de la planilla | Formato DateTime | [CONFIRMADO VISUALMENTE] |
| `estado_factura` | Char(1) | Estado de recaudación de la planilla | `P` = Pendiente (rojo), `C` = Cobrado (verde) | [CONFIRMADO VISUALMENTE] |
| `origen` | Varchar(30) | Origen contable del registro | Valor fijo 'FA_FACTURAS' | [CONFIRMADO VISUALMENTE] |
| `dias_mora` | Integer | Antigüedad en días desde emisión | Calculado: `DATEDIFF(NOW, fecha)` | [CONFIRMADO VISUALMENTE] |

## Relaciones

- Pertenece a una `CUENTA_SUMINISTRO` (N:1).

## Reglas Relacionadas

- [BR-001: Umbral Mínimo](../../05-business-rules/BR-001-minimum-threshold.md)
- [BR-002: Exclusión de Intereses](../../05-business-rules/BR-002-interest-exclusion.md)
- [BR-003: Anulación Automática por Cobro](../../05-business-rules/BR-003-concurrent-payment-cancellation.md)

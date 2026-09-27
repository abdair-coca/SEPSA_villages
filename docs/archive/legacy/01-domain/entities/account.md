---
title: "Entidad: Cuenta / Suministro"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "customer.md"
  - "meter.md"
  - "cut-order.md"
  - "debt-invoice.md"
  - "technical-location.md"
  - "../../05-business-rules/BR-001-minimum-threshold.md"
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
---

# Cuenta / Suministro (`CUENTA_SUMINISTRO`)

## Propósito

Representa el punto físico y contractual de entrega de energía eléctrica de SEPSA. Es la entidad nuclear sobre la cual orbitan la medición, la facturación mensual, la ubicación territorial y las órdenes operativas de suspensión y reposición.

## Descripción

La cuenta vincula al cliente titular con un medidor específico instalado en una ruta geográfica. Posee un estado contractual (`A` = Activo), un régimen tarifario (ej. `RS`), un título habilitante (`R`) y un circuito eléctrico de cabecera (`D-1182`).

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `cuenta_id` | Integer [PK] | Número identificador del suministro | Clave Primaria (ej. 306040, 1701603) | [CONFIRMADO VISUALMENTE] |
| `categoria_tarifa` | Varchar(10) | Código de tarifa aplicada | Ej. 'RS' (Residencial / Social) | [CONFIRMADO VISUALMENTE] |
| `estado_cliente` | Char(1) | Estado contractual del servicio | 'A' = Activo | [CONFIRMADO VISUALMENTE] |
| `titulo_habilitante` | Varchar(10) | Título de habilitación regulatoria | Ej. 'R' | [CONFIRMADO VISUALMENTE] |
| `circuito_codigo` | Varchar(20) | Identificador del alimentador/circuito | Ej. 'D-1182' | [CONFIRMADO VISUALMENTE] |
| `nro_medidor_actual`| Varchar(30) [FK] | Serie del medidor actualmente en servicio | Clave Foránea hacia `MEDIDOR` | [CONFIRMADO VISUALMENTE] |
| `ruta_codigo` | Varchar(20) [FK] | Código de la ruta de distribución | Clave Foránea hacia `UBICACION_TECNICA` | [CONFIRMADO VISUALMENTE] |
| `ci_nit_titular` | Varchar(20) [FK] | Identificador del titular del servicio | Clave Foránea hacia `CLIENTE` | [ALTAMENTE INFERIDO] |

## Relaciones

- Pertenece a un `CLIENTE` (N:1) [ALTAMENTE INFERIDO].
- Tiene instalado un único `MEDIDOR` activo (1:1) [CONFIRMADO VISUALMENTE].
- Está ubicado en una `UBICACION_TECNICA` (N:1) [CONFIRMADO VISUALMENTE].
- Acumula múltiples planillas en `FACTURA_DEUDA` (1:N) [CONFIRMADO VISUALMENTE].
- Es sujeto de múltiples intervenciones en `ORDEN_CORTE` (1:N) [CONFIRMADO VISUALMENTE].

## Reglas Relacionadas

- [BR-001: Umbral Mínimo para Emisión de Corte](../../05-business-rules/BR-001-minimum-threshold.md)
- [BR-003: Anulación Automática por Cobranza Concurrente](../../05-business-rules/BR-003-concurrent-payment-cancellation.md)
- [BR-006: Regularización Obligatoria de Datos Fiscales](../../05-business-rules/BR-006-tax-id-mandatory-regularization.md)
- [BR-008: Impedimento de Suspensión por Protección Legal](../../05-business-rules/BR-008-legal-protection-block.md)

## Flujos y Pantallas Relacionadas

- Flujos: [Flujo 1](../../04-flows/flow-001-filter-and-issue-cut-batch.md), [Flujo 2](../../04-flows/flow-002-execute-field-cut.md), [Flujo 3](../../04-flows/flow-003-concurrent-payment-auto-cancellation.md).
- Pantallas: [P-02 Búsqueda](../../07-ui/screens/P-02-delinquency-search.md), [P-03 Bandeja](../../07-ui/screens/P-03-cut-tray.md), [P-04 Ficha de Corte](../../07-ui/screens/P-04-cut-file.md), [P-06 Kardex](../../07-ui/screens/P-06-customer-kardex.md).

## Evidencia e Incertidumbres

- **Evidencia**: Observada de forma transversal en el video en los minutos 01:45, 03:25, 08:46.
- **Incertidumbres**: No se evidenció explícitamente si un cambio de medidor conserva el historial bajo el mismo `cuenta_id` o si genera una subcuenta histórica.

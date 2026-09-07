---
id: "BR-001"
title: "Umbral Mínimo para Emisión de Corte"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-001-filter-delinquent-customers.md"
  - "../../01-domain/entities/debt-invoice.md"
---

# BR-001: Umbral Mínimo para Emisión de Corte

## Regla

Un suministro califica para suspensión del servicio cuando adeuda **2 o más facturas vencidas con una antigüedad superior a 30 días** respecto a su fecha formal de emisión.

## Contexto

Gobernanza de corte regulatorio en SEPSA. Impide suspender suministros por mora corriente menor a 30 días o con una sola factura impaga.

## Entidades Afectadas

- `CUENTA_SUMINISTRO`
- `FACTURA_DEUDA`
- `ORDEN_CORTE`

## Evidencia Visual

Banner explícito en pantalla P-02: *"Los resultados mostrarán clientes con 2 facturas vencidas mayor a 30 días"*. Minuto 00:40 a 01:42.

## Criterios de Validación

- Cuenta con 1 factura vencida $ightarrow$ NO califica para corte.
- Cuenta con 2 facturas con 20 días de mora $ightarrow$ NO califica para corte.
- Cuenta con 2 facturas con $> 30$ días de mora y estado contractual `A` $ightarrow$ SÍ califica para corte.

## Casos de Prueba (TDD)

- `TC-BR-001-01`: Rechazar suministro con 1 factura vencida de 60 días.
- `TC-BR-001-02`: Rechazar suministro con 2 facturas vencidas de 15 días.
- `TC-BR-001-03`: Aceptar suministro con 2 facturas vencidas de 31 y 62 días.

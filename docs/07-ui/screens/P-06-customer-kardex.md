---
id: "P-06"
title: "Pantalla P-06: Kardex Integral del Cliente"
type: "screen"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "P-02-delinquency-search.md"
  - "P-04-cut-file.md"
  - "../../05-business-rules/BR-006-tax-id-mandatory-regularization.md"
---

# Pantalla P-06: Kardex Integral del Cliente (`/kardex`)

## Propósito

Auditoría contable y recaudación de suministros en el sistema comercial central.

## Módulo

`cobros.sepsa.web.bo` (M2).

## Elementos Visuales

1. **Selector de Caja**: Caja `SP-JDQT`, entidad recaudadora `SEPSA URBANO`.
2. **Buscador por Cuenta**: Input numérico para carga directa.
3. **Alerta Modal Urgente ([BR-006](../../05-business-rules/BR-006-tax-id-mandatory-regularization.md))**:
   - *"El usuario no tiene Nit o CI. Infórmele que debe realizar la actualización de su información... URGENTE"*.
4. **Cabecera Contractual**: Nombre del titular, Tarifa (`RS`), Circuito, Serie y marca de medidor (`WASION`), Multiplicador (`1`).
5. **Historial Cronológico de Facturas**: Fechas de emisión, Lectura anterior y actual, Consumo en kWh, Importes desglosados, Estado (`P` rojo, `C` verde) y fecha/caja de pago.

## Evidencia

Video: 03:15 - 05:54.

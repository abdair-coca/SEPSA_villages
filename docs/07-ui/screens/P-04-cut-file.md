---
id: "P-04"
title: "Pantalla P-04: Ficha Integral de Corte"
type: "screen"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "P-05-cut-execution-modal.md"
  - "P-06-customer-kardex.md"
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
---

# Pantalla P-04: Ficha Integral de Corte (`/corte/{id}`)

## Propósito

Vista consolidada de 360 grados de la orden de suspensión de un suministro particular.

## Módulo

`cortes.sepsa.net.bo` (M1).

## Elementos Visuales

1. **Toolbar Superior**: Botones *Ver Trazabilidad*, *Actualizar*, *Ver Kardex* (abre P-06), *Verificar Deuda*.
2. **Encabezado**: `C.U.C.: {id}` con badge de estado (`ESTADO: GENERADO` o `ESTADO: ANULADO`).
3. **Panel General del Suministro**: Cuenta, Número de Medidor, Nombre del Titular, Dirección, Teléfono, Índice del medidor.
4. **Alerta de Georreferenciación / GIS**: Muestra estado de coordenadas de catastro o mensaje de error SQL al consultar GIS.
5. **Tabla Detalle de Deuda `T-03`**: Periodo, Año, Fecha emisión, Monto en Bs, Estado (`P`), Origen (`FA_FACTURAS`), Días de mora.
6. **Indicadores de Salvaguarda**: `Tiene Reclamos: NO`, `Plan de Pago: NO`.
7. **Zona Dropzone de Archivos Adjuntos**: Límite 20 MB por archivo.
8. **Pestañas Colapsables Inferiores**: *Datos de Corte*, *Datos de Suspensión*, *Datos de Pago*, *Datos de Reconexión*.
9. **Botón Principal de Terreno**: *Registrar corte efectivo* (rojo, abre modal `P-05`).

## Evidencia

Video: 07:40 - 09:20 y 11:36 - 13:53.

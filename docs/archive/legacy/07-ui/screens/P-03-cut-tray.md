---
id: "P-03"
title: "Pantalla P-03: Bandeja de Registros para Cortar"
type: "screen"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "P-04-cut-file.md"
  - "../../03-features/feature-003-cut-orders-tray-management.md"
---

# Pantalla P-03: Bandeja de Registros para Cortar (`/verCortes`)

## Propósito

Bandeja de entrada de suspensiones emitidas en estado `GENERADO`, ordenadas por tiempo transcurrido para control y despacho de cuadrillas.

## Módulo

`cortes.sepsa.net.bo` (M1).

## Elementos Visuales

1. **Tarjeta de Contador**: Destaca el valor `46` con badge rojo `GENERADO`.
2. **Filtros Superiores**: No. de cuenta, Nro. de medidor, Ruta, Técnico, Título habilitante, Área regional.
3. **Botones de Cabecera**: *Limpiar Filtros*, *Buscar*, *Refrescar*.
4. **Pestañas**: *Registros para cortar (46)* y *Mapa y detalles*.
5. **Tabla de Órdenes `T-02`**: Ver [components.md](../components.md).
   - Incluye botón **Ver corte** que navega a `P-04`.

## Evidencia

Video: 06:50 - 07:39 y 13:54 - 16:55.

---
id: "P-02"
title: "Pantalla P-02: Búsqueda de Morosidad y Creación de Órdenes"
type: "screen"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../navigation.md"
  - "P-03-cut-tray.md"
  - "../../05-business-rules/BR-001-minimum-threshold.md"
---

# Pantalla P-02: Búsqueda de Morosidad y Creación de Órdenes (`/orden/create`)

## Propósito

Filtrar suministros con mora activa según la división territorial de distribución eléctrica y consolidar lotes de órdenes de corte.

## Módulo

`cortes.sepsa.net.bo` (M1).

## Formulario de Parámetros de Búsqueda

| Campo / Label | Tipo de Control | Obligatorio | Rango / Valores | Comportamiento en Pantalla |
| --- | --- | --- | --- | --- |
| **Área Regional** | Select (dropdown) | Sí | `B - BETANZOS`, `P - POTOSI` | Dispara petición asíncrona para poblar Localidad. |
| **Localidad** | Select (dropdown) | Sí | `002 - MOJOTORILLO` | Dependiente de Área. Pueblan el selector de Ruta. |
| **Ruta** | Select (dropdown) | Sí | `002 - MOJOTORILLO` | Dependiente de Localidad. Define el sector territorial. |
| **Facturas pendientes vencidas** | Number input (spinner)| Sí | Entero $\ge 1$ (default `2`) | El usuario puede alterar el número con spinner o teclado. |
| **Estados de cliente** | Multi-select chips | Sí | Token fijo: `Activos (A)` | Filtra únicamente suministros con contrato activo. |

## Banners y Botones

- **Banner**: *"Los resultados mostrarán clientes con 2 facturas vencidas mayor a 30 días. Los montos en los resultados no incluyen cálculos de intereses ya que estos varían día a día"*.
- **Botón Buscar** (azul).
- **Botones de Reporte**: *Descargar Excel de deudores morosos*, *Descargar PDF de deudores morosos*, *Descargar Excel simple*, *Descargar PDF simple*.
- **Botón Crear orden de corte** (rojo destacado).
- **Tabla de Resultados `T-01`**: Ver [components.md](../components.md).

## Evidencia

Video: 00:40 - 03:12.

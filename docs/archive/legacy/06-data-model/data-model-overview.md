---
title: "Resumen del Modelo de Datos Provisional"
type: "data-model"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "fields-catalog.md"
  - "er-diagram.md"
  - "states.md"
---

# Resumen del Modelo de Datos Provisional

El modelo de datos relacional de SEPSA se organiza en tablas maestras de infraestructura y catálogo, y tablas transaccionales de control operativo.

```
======================================================================
1. TABLAS MAESTRAS Y DE CATÁLOGO
======================================================================
- CLIENTE: ci_nit [PK], nombres, telefono_contacto
- MEDIDOR: nro_medidor [PK], marca, multiplicador, indice_medidor
- UBICACION_TECNICA: ruta_codigo [PK], area_codigo, localidad_codigo, orden_recorrido, direccion_texto, latitud_catastro, longitud_catastro
- USUARIO_SISTEMA: usuario_id [PK], ci, nombre_completo, email, telefono
- INFRAESTRUCTURA_RED_GIS: poste_id [PK], transformador_id [FK], circuito_mora, tiene_lecturador, geometria_geom

======================================================================
2. TABLAS TRANSACCIONALES
======================================================================
- CUENTA_SUMINISTRO: cuenta_id [PK], categoria_tarifa, estado_cliente, titulo_habilitante, circuito_codigo, nro_medidor_actual [FK], ruta_codigo [FK], ci_nit_titular [FK]
- FACTURA_DEUDA: cuenta_id [FK], periodo_anio, periodo_mes, monto_factura, fecha_facturacion, estado_factura, origen
- ORDEN_CORTE: nro_registro [PK CUC], cuenta_id [FK], estado_corte, fecha_generacion, deuda_mes_tope, usuario_asignado_id [FK], motivo_anulacion
- EJECUCION_CORTE: orden_corte_id [FK/PK], tipo_corte, lectura_corte, medidores_cercanos, saltar_control_fotos, saltar_control_coordenadas, latitud_ejecucion, longitud_ejecucion
- REHABILITACION_RECONEXION: orden_corte_id [FK/PK], es_reconexion_manual, orden_emitida_por, orden_emitida_el, fecha_reposicion, tecnico_reposicion, rehabilitacion_registrado_por, rehabilitacion_registrado_en
- SUSPENSION_REGISTRO: orden_corte_id [FK/PK], fecha_inhabilitacion, usuario_inhabilitacion, fecha_real_inhabilitacion, registrado_por, registrado_en, observacion
- ADJUNTO_CORTE: adjunto_id [PK], orden_corte_id [FK], nombre_archivo, mime_type
```

## Campos Calculados y Agregaciones

1. **`dias_desde_generacion`**: `DATEDIFF(NOW(), ORDEN_CORTE.fecha_generacion)` (visualizado en `P-03`).
2. **`dias_mora`**: `DATEDIFF(NOW(), FACTURA_DEUDA.fecha_facturacion)` (visualizado en `P-04`).
3. **`facturas_vencidas_30d`**: `COUNT(factura_id)` con mora $> 30$ días (criterio `BR-001`).
4. **`total_pendiente`**: `SUM(FACTURA_DEUDA.monto_factura)` para facturas con estado `P`.

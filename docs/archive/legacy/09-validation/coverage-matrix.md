---
title: "Matriz de Cobertura Documental"
type: "validation"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "traceability.md"
---

# Matriz de Cobertura Documental

| Elemento Observado en el Video | Documentado en Especificación | Modelado en Datos (ERD) | Estado Funcional |
| --- | --- | --- | --- |
| Dashboard y Temporizador de Sesión | Sí (P-01, UI) | Sí (`USUARIO_SISTEMA`) | Completo |
| Filtros Territoriales en Cascada | Sí (P-02, UI) | Sí (`UBICACION_TECNICA`) | Completo |
| Búsqueda con Umbral $\ge 2$ Facturas | Sí (P-02, BR-001) | Sí (`FACTURA_DEUDA`, `BR-001`) | Completo |
| Botón Rojo "Crear Orden de Corte" | Sí (P-02, F-002) | Sí (`ORDEN_CORTE`) | Completo |
| Bandeja 46 Cortes y Cálculo de Días | Sí (P-03, F-003) | Sí (`dias_desde_generacion`) | Completo |
| Ficha Integral y Deuda FA_FACTURAS | Sí (P-04, UI) | Sí (`FACTURA_DEUDA`) | Completo |
| Orden Anulada por Pago y Motivo | Sí (P-04, BR-003) | Sí (`motivo_anulacion`, `BR-003`) | Completo |
| Modal de Corte: Métodos, Lectura, Bypass | Sí (P-05, F-004) | Sí (`EJECUCION_CORTE`) | Completo |
| Dropzone Adjuntos (20 MB) | Sí (P-04, UI) | Sí (`ADJUNTO_CORTE`) | Completo |
| Paneles Suspensión y Reconexión | Sí (P-04, UI) | Sí (`REHABILITACION_RECONEXION`) | Completo |
| Kardex y Alerta Bloqueante NIT/CI | Sí (P-06, BR-006) | Sí (`CLIENTE`, `BR-006`) | Completo |
| Visualizador GIS en QField | Sí (P-08, P-09) | Sí (`INFRAESTRUCTURA_RED_GIS`) | Completo |

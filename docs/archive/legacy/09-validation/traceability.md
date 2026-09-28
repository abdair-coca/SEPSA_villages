---
title: "Matriz de Trazabilidad Completa"
type: "validation"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "evidence-map.md"
  - "uncertainties.md"
---

# Matriz de Trazabilidad Completa

| Elemento del Modelo | Categoría | Pantalla / Entorno | Marca Temporal | Nivel de Certeza |
| --- | --- | --- | --- | --- |
| `CUENTA_SUMINISTRO` | Entidad | Transversal | 01:45, 03:25, 08:46 | [CONFIRMADO VISUALMENTE] |
| `ORDEN_CORTE` | Entidad | P-03, P-04 | 07:22, 08:46 | [CONFIRMADO VISUALMENTE] |
| `MEDIDOR` | Entidad | P-02, P-04, P-06 | 01:45, 03:31, 08:46 | [CONFIRMADO VISUALMENTE] |
| `FACTURA_DEUDA` | Entidad | P-04 (Deuda) | 08:49 | [CONFIRMADO VISUALMENTE] |
| `USUARIO_SISTEMA` | Entidad | P-01, P-03 | 00:05, 07:05 | [CONFIRMADO VISUALMENTE] |
| `EJECUCION_CORTE` | Entidad | P-05 (Modal) | 09:21 - 11:35 | [ALTAMENTE INFERIDO] |
| `REHABILITACION_RECONEXION` | Entidad | P-04 (Auditoría) | 12:02 - 12:20 | [CONFIRMADO VISUALMENTE] |
| `SUSPENSION_REGISTRO` | Entidad | P-04 (Auditoría) | 12:02 | [CONFIRMADO VISUALMENTE] |
| Tipo de Corte | Campo | P-05 | 09:58 | [CONFIRMADO VISUALMENTE] |
| Lectura del Corte | Campo | P-05 | 11:21 | [CONFIRMADO VISUALMENTE] |
| Saltar Fotos / Coords | Campo / Regla | P-05 | 10:47, 10:50 | [CONFIRMADO VISUALMENTE] |
| Anulación por Pago | Regla (BR-003) | P-04 (corte 443797) | 07:42 | [CONFIRMADO VISUALMENTE] |
| Bloqueo por GPS | Regla | P-04 | 07:41, 08:43 | [CONFIRMADO VISUALMENTE] |
| Capas Red GIS | Entidad / Catálogo | P-09 (QField) | 21:26 - 24:43 | [CONFIRMADO VISUALMENTE] |

---
title: "Entidad: Infraestructura de Red GIS"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "account.md"
  - "../../02-modules/gis/overview.md"
---

# Infraestructura de Red GIS (`INFRAESTRUCTURA_RED_GIS`)

## Propósito

Representa los elementos físicos geoespaciales de la red de media y baja tensión de SEPSA que posibilitan la localización y corte de suministros en terreno.

## Descripción

Observada en los proyectos de QField `sis_dondiego` y `OBS-RAULEX`. Modela transformadores de distribución, postes con rotulado físico, tramos de baja tensión y alimentadores de media tensión.

## Campos

| Campo | Tipo Técnico | Descripción | Valores Observados | Confianza |
| --- | --- | --- | --- | --- |
| `poste_id` | Varchar(30) [PK] | Código rotulado del poste | Ej. '139', '026' | [CONFIRMADO VISUALMENTE] |
| `transformador_id` | Varchar(30) [FK] | Código del transformador | Triángulo rojo en mapa | [CONFIRMADO VISUALMENTE] |
| `circuito_mora` | Boolean | Indica si el circuito contiene morosos | Filtro temático de capa | [CONFIRMADO VISUALMENTE] |
| `tiene_lecturador` | Boolean | Clasificación de toma de lecturas | Atributo de capa GIS | [CONFIRMADO VISUALMENTE] |
| `geometria_geom` | Geometry(Point/Line) | Coordenadas espaciales PostGIS | EPSG:4326 o proyección local | [CONFIRMADO VISUALMENTE] |

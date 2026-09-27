---
title: "M4: GIS Móvil / Cartografía de Red"
type: "module"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../07-ui/screens/P-08-gis-field-map.md"
  - "../../07-ui/screens/P-09-gis-layers-tree.md"
---

# M4: GIS Móvil / Cartografía de Red (`QField / QGIS`)

## Propósito

Solución geoespacial móvil y de escritorio encargada de representar visualmente la infraestructura eléctrica física de distribución y localizar con exactitud los suministros morosos sobre el terreno.

## Pantallas y Entornos Asociados

- **[P-08 Cartografía de Campo](../../07-ui/screens/P-08-gis-field-map.md)**: Proyecto QField `sis_dondiego` navegable sobre imagen satelital en dispositivos Android.
- **[P-09 Inspector del Árbol de Capas](../../07-ui/screens/P-09-gis-layers-tree.md)**: Proyecto QField / QGIS `OBS-RAULEX`.

## Capas Vectoriales Documentadas

1. **Grupo `med.pt6`**:
   - `Activo - sin mora`
   - `Activo - con mora >= 3`
   - `Temporal`
   - `Usuarios para Rehabilitar`
   - `Inhabilitados`
   - `No vinculado`
2. **Grupo `red`**:
   - `transformadordistribucion` (trafo, Circuitos con mora, TIENE LECTURADOR, NO TIENE LECTURADOR)
   - `elementoproteccion`
   - `tramobajatension`
   - `lineaaereamt`
   - `estructurasoporte` (postes codificados)
   - `capa comunal municipal [46]`

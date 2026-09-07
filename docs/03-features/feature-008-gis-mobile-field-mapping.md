---
title: "Feature F-008: Cartografía Móvil y Navegación Espacial en QField"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../02-modules/gis/overview.md"
  - "../../07-ui/screens/P-08-gis-field-map.md"
---

# F-008: Cartografía Móvil y Navegación Espacial en QField

## Objetivo

Permitir a las cuadrillas en campo localizar físicamente postes, transformadores y acometidas en mora sobre el terreno sin requerir conexión a Internet continua.

## Actor

Liniero de Terreno / Especialista GIS.

## Comportamiento

- Representación de etiquetas compuestas en el mapa: `C:{cuenta} M:{medidor} {marca} Mes:{cant_meses} - {monto} Bs`.
- Simbología temática: transformadores en triángulos rojos, postes con rotulado de código físico (`139`, `026`), circuitos con mora resaltados.
- Navegación offline con visualización de la posición GPS del vehículo en tiempo real.

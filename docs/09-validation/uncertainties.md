---
title: "Incertidumbres, Vacíos y Elementos Desconocidos"
type: "validation"
status: "inferred"
confidence: "medium"
source: "master-analysis"
related:
  - "risk-analysis.md"
  - "../../00-system-context/system-boundaries.md"
---

# Incertidumbres, Vacíos y Elementos Desconocidos

A partir del análisis de ingeniería inversa visual, se identificaron 5 vacíos arquitectónicos que deben validarse formalmente con SEPSA:

1. **Protocolo de Sincronización GIS $\leftrightarrow$ Backend**: Se desconoce si QField sincroniza de forma bidireccional mediante QFieldCloud, WFS-T o mediante copiado manual de archivos GeoPackage/SQLite en la memoria interna del teléfono. [DESCONOCIDO]
2. **Integración con `FA_FACTURAS`**: Se desconoce si reside en la misma base de datos o si se consume vía DBLink, vista materializada o API REST externa de facturación comercial. [DESCONOCIDO]
3. **Persistencia Física de la Ejecución de Corte**: No pudo comprobarse a nivel DDL si los campos del modal de corte se guardan como columnas en `ORDEN_CORTE` o en una tabla 1:1 independiente (`EJECUCION_CORTE`). [ALTAMENTE INFERIDO]
4. **Mecanismo de la Orden de Reconexión**: Se desconoce si tras el cobro se reutiliza el mismo ID de corte con estado modificado o si se instancia una nueva orden independiente de reposición. [DESCONOCIDO]
5. **Algoritmo de Intereses Diarios**: Los intereses no se desglosan en las pantallas observadas; la tasa y fórmula no aparecen en el video. [DESCONOCIDO]

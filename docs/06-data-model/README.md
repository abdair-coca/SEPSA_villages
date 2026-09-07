---
title: "Modelo de Datos y Esquemas Técnicos"
type: "data-model"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../README.md"
  - "data-model-overview.md"
  - "fields-catalog.md"
  - "relationships.md"
  - "states.md"
  - "er-diagram.md"
---

# 06 - Modelo de Datos y Esquemas Técnicos

Esta sección consolida las definiciones físicas, lógicas, campos atómicos, diagramas relacionales y ciclos de vida de datos deducidos de la ingeniería inversa.

## Documentos Disponibles

- [data-model-overview.md](data-model-overview.md): Arquitectura relacional transaccional y catálogo de tablas provisorias.
- [fields-catalog.md](fields-catalog.md): Diccionario de datos exhaustivo con los 51 campos atómicos observados (C-01 a C-51).
- [relationships.md](relationships.md): Claves primarias, claves foráneas y cardinalidades entre tablas.
- [states.md](states.md): Ciclo de vida formal de la orden de corte (`GENERADO`, `EJECUTADO`, `ANULADO`, `RECONEXIÓN`) y estados de facturación.
- [er-diagram.md](er-diagram.md): Diagrama Entidad-Relación formal en sintaxis Mermaid ER.

---
title: "Requerimientos No Funcionales"
type: "requirements"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "acceptance-criteria.md"
  - "../../10-development/architecture-decisions.md"
---

# Requerimientos No Funcionales

1. **Disponibilidad Offline-First en Terreno**: Las cuadrillas operan en zonas rurales de Potosí sin conectividad. Las aplicaciones móviles (PWA / QField) deben almacenar datos locales y permitir la captura offline de cortes y fotos.
2. **Idempotencia Transaccional**: La sincronización de órdenes y cortes ejecutados debe soportar reintentos de red sin generar duplicaciones ni inconsistencias de saldo.
3. **Consistencia Concurrente en Cobros**: La anulación de órdenes de corte por pago en ventanilla debe propagarse en tiempo real (< 5 segundos) hacia los despachos de cuadrillas para evitar cortes improcedentes.
4. **Capacidad de Almacenamiento**: Soporte de archivos adjuntos de hasta 20 MB por documento con almacenamiento seguro de binarios.
5. **Rendimiento Geoespacial**: Consultas espaciales sobre capas de red eléctrica (postes y transformadores) indexadas en PostGIS mediante índices R-Tree / GiST.

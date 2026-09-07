---
title: "Análisis de Riesgos de Replicación"
type: "validation"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "uncertainties.md"
  - "../../10-development/architecture-decisions.md"
---

# Análisis de Riesgos de Replicación

| Nivel | Riesgo Identificado | Causa Raíz | Impacto en el Sistema | Mitigación Recomendada |
| --- | --- | --- | --- | --- |
| **CRÍTICO** | Acoplamiento erróneo de la base de facturación | Intentar modelar la facturación dentro de cortes cuando `FA_FACTURAS` es externa. | Inconsistencia contable y desincronización de saldos. | Diseñar el módulo de deuda como integración de solo lectura desacoplada. |
| **ALTO** | Falta de sincronización push en terreno | Cuadrillas en campo usando herramientas desconectadas sin alertas push. | Cortes indebidos a clientes que acaban de pagar en ventanilla. | Implementar WebSockets / Push Notifications para anular órdenes en la app móvil. |
| **ALTO** | Inconsistencia de fuentes de coordenadas | El sistema muestra excepción SQL en GIS y recurre a catastro. | Cuadrillas buscando suministros en puntos erróneos del mapa. | Unificar el modelo geoespacial en una única base PostGIS validada. |
| **MEDIO** | Abuso no auditado de flags de bypass | `Saltar fotos` y `Saltar coords` no exigen justificación en UI. | Reportes de corte falsos sin respaldo fotográfico. | Exigir motivo obligatorio o firma del supervisor para activar bypass. |

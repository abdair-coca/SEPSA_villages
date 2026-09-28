---
title: "Feature F-006: Gestión de Rehabilitación y Reposición de Servicio"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../05-business-rules/BR-007-reconversion-priority.md"
  - "../../01-domain/entities/reconnection.md"
---

# F-006: Gestión de Rehabilitación y Reposición de Servicio

## Objetivo

Controlar y auditar la reenergización física del suministro eléctrico una vez subsanadas las obligaciones financieras.

## Actor

Supervisor de Cortes / Liniero.

## Comportamiento

- Verificación previa de saldos pendientes en conceptos de "Otros Ingresos" (aranceles de reconexión).
- Si existen cargos no reconvertidos, bloquea el restablecimiento ([BR-007](../../05-business-rules/BR-007-reconversion-priority.md)).
- Registro de fecha y hora de reposición, liniero asignado y método manual.
- Transición de la orden al estado `RECONEXIÓN` y normalización del suministro.

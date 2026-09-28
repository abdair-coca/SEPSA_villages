---
title: "Flujos Transaccionales del Sistema"
type: "flow"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../README.md"
  - "flow-001-filter-and-issue-cut-batch.md"
  - "flow-002-execute-field-cut.md"
  - "flow-003-concurrent-payment-auto-cancellation.md"
  - "flow-004-reconnection-workflow.md"
---

# 04 - Flujos Transaccionales del Sistema

Esta carpeta contiene los diagramas de secuencia formales y especificaciones paso a paso de los flujos operativos observados en el sistema SEPSA.

| ID | Flujo | Propósito | Actores |
| --- | --- | --- | --- |
| **FLOW-001** | [Filtrado de Morosidad y Emisión de Lote](flow-001-filter-and-issue-cut-batch.md) | Consulta territorial y generación masiva de órdenes. | Supervisor de Cortes |
| **FLOW-002** | [Ejecución y Registro de Corte en Terreno](flow-002-execute-field-cut.md) | Captura de GPS, lectura de medidor y desconexión física. | Liniero en Terreno |
| **FLOW-003** | [Anulación Automática por Cobranza Concurrente](flow-003-concurrent-payment-auto-cancellation.md) | Cancelación inmediata de orden ante pago en ventanilla. | Cajero / Proceso Automático |
| **FLOW-004** | [Reconexión y Restablecimiento del Servicio](flow-004-reconnection-workflow.md) | Regularización financiera y reposición física de energía. | Cajero / Liniero |

---
title: "Catálogo de Funcionalidades (Features)"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../README.md"
  - "../04-flows/README.md"
  - "../05-business-rules/README.md"
---

# 03 - Catálogo de Funcionalidades (Features)

Esta carpeta contiene la descomposición atómica de capacidades funcionales del sistema, preparadas para Especificación Dirigida por Requisitos (SDD) y diseño de casos de prueba (TDD).

| ID | Funcionalidad | Módulo | Actores | Reglas Vinculadas |
| --- | --- | --- | --- | --- |
| **F-001** | [Filtrado de Morosidad por Jerarquía](feature-001-filter-delinquent-customers.md) | M1 | Supervisor | BR-001, BR-002 |
| **F-002** | [Emisión Masiva de Lotes de Corte](feature-002-create-cut-orders-batch.md) | M1 | Supervisor | BR-001 |
| **F-003** | [Gestión y Monitoreo de Bandeja de Cortes](feature-003-cut-orders-tray-management.md) | M1 | Supervisor / Liniero | BR-003 |
| **F-004** | [Registro de Ejecución Material en Terreno](feature-004-execute-field-cut.md) | M1, M3 | Liniero | BR-004, BR-005 |
| **F-005** | [Anulación Concurrente por Pago en Caja](feature-005-concurrent-payment-cancellation.md) | M1, M2 | Sistema / Cajero | BR-003 |
| **F-006** | [Gestión de Rehabilitación y Reposición](feature-006-reconnection-management.md) | M1 | Supervisor / Liniero | BR-007 |
| **F-007** | [Consulta de Kardex y Validación Tributaria](feature-007-kardex-inquiry-tax-validation.md) | M2 | Cajero | BR-006 |
| **F-008** | [Cartografía Móvil y Navegación Espacial](feature-008-gis-mobile-field-mapping.md) | M4 | Liniero / GIS | - |

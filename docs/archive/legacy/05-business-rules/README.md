---
title: "Catálogo de Reglas de Negocio"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../README.md"
  - "BR-001-minimum-threshold.md"
  - "BR-002-interest-exclusion.md"
  - "BR-003-concurrent-payment-cancellation.md"
  - "BR-004-gps-mandatory-with-bypass.md"
  - "BR-005-photo-evidence-with-bypass.md"
  - "BR-006-tax-id-mandatory-regularization.md"
  - "BR-007-reconversion-priority.md"
  - "BR-008-legal-protection-block.md"
---

# 05 - Catálogo de Reglas de Negocio

Esta carpeta contiene la especificación formal e inmutable de las 8 reglas de negocio críticas detectadas en el sistema SEPSA.

| ID | Título de la Regla | Dominio / Módulo | Nivel de Certeza |
| --- | --- | --- | --- |
| **BR-001** | [Umbral Mínimo para Emisión de Corte](BR-001-minimum-threshold.md) | Cortes / Cartera | [CONFIRMADO VISUALMENTE] |
| **BR-002** | [Exclusión de Intereses en Listados de Morosidad](BR-002-interest-exclusion.md) | Cortes / Financiero | [CONFIRMADO VISUALMENTE] |
| **BR-003** | [Anulación Automática por Cobranza Concurrente](BR-003-concurrent-payment-cancellation.md) | Cortes / Cobros | [CONFIRMADO VISUALMENTE] |
| **BR-004** | [Obligatoriedad de Coordenadas GPS con Excepción](BR-004-gps-mandatory-with-bypass.md) | Terreno / Operaciones | [CONFIRMADO VISUALMENTE] |
| **BR-005** | [Excepción Controlada de Evidencia Fotográfica](BR-005-photo-evidence-with-bypass.md) | Terreno / Operaciones | [CONFIRMADO VISUALMENTE] |
| **BR-006** | [Regularización Obligatoria de Datos Fiscales](BR-006-tax-id-mandatory-regularization.md) | Cobros / Tributario | [CONFIRMADO VISUALMENTE] |
| **BR-007** | [Prioridad de Reconversión / Otros Ingresos](BR-007-reconversion-priority.md) | Reposiciones / Comercial | [CONFIRMADO VISUALMENTE] |
| **BR-008** | [Impedimento de Suspensión por Protección Legal](BR-008-legal-protection-block.md) | Cortes / Legal | [ALTAMENTE INFERIDO] |

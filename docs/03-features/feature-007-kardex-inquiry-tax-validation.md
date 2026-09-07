---
title: "Feature F-007: Consulta de Kardex y Validación Tributaria Urgente"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../05-business-rules/BR-006-tax-id-mandatory-regularization.md"
  - "../../07-ui/screens/P-06-customer-kardex.md"
---

# F-007: Consulta de Kardex y Validación Tributaria Urgente

## Objetivo

Permitir la auditoría histórico-financiera del cliente en ventanilla y forzar la regularización de datos fiscales (CI/NIT) ausentes.

## Actor

Cajero / Operador Comercial (`cobros.sepsa.web.bo`).

## Comportamiento

1. Al buscar por número de cuenta en `/kardex`, el sistema valida si `ci_nit` está presente.
2. Si está ausente o vacío, despliega un modal bloqueante: `"El usuario no tiene Nit o CI. Infórmele que debe realizar la actualización de su información... URGENTE"`.
3. Al aceptar, despliega la ficha contractual (Tarifa RS, Multiplicador 1, Serie Medidor) y la tabla de facturas con consumos históricos en kWh.

---
title: "Supuestos e Hipótesis Arquitectónicas"
type: "validation"
status: "inferred"
confidence: "medium"
source: "master-analysis"
related:
  - "uncertainties.md"
---

# Supuestos e Hipótesis Arquitectónicas

1. **Estructura Relacional 1:1 de Ejecución**: Se asume que `EJECUCION_CORTE` se modela como tabla hija 1:1 de `ORDEN_CORTE` para mantener limpio el registro administrativo de la orden.
2. **Entidad de Adjuntos**: Se modela `ADJUNTO_CORTE` como una relación 1:N respecto a la orden, con soporte de almacenamiento desacoplado (S3/MinIO o disco local del servidor).
3. **Consumo de Facturación**: Se plantea que el sistema nuevo consumirá `FA_FACTURAS` mediante una vista sincronizada o API de integración para evitar acoplamiento directo a la lógica de facturación de SEPSA.

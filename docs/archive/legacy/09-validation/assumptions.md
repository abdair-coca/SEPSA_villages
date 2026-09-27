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
4. **Nro. de registro ≈ CUC**: En el ejemplo observado coinciden (`446920`). Hipótesis pendiente de confirmación con más registros. Ver [video-corte-efectivo-3min.md](video-corte-efectivo-3min.md).
5. **Índice de medidor ≈ Lectura del Corte**: El mismo dato aparece con dos nombres en dos vistas. Hipótesis de dato único reutilizado.
6. **Fecha Real ≈ momento físico real** vs fecha registrada/programada en suspensión. Hipótesis pendiente.
7. **Usuario Corte / Registrado por**: `Técnico Corte` = quien ejecuta físicamente; `Corte Registrado por/en` = cuenta y momento de carga (probablemente automáticos). Hipótesis pendiente.

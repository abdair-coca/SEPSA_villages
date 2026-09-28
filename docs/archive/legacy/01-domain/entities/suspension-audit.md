---
title: "Entidad: Suspensión Administrativa"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "cut-order.md"
---

# Suspensión Administrativa (`SUSPENSION_REGISTRO`)

## Propósito

Almacena la auditoría formal de baja administrativa del suministro eléctrico cuando se procesa la inhabilitación del contrato.

## Campos

| Campo | Tipo Técnico | Descripción | Confianza |
| --- | --- | --- | --- |
| `orden_corte_id` | Integer [FK/PK] | Orden de corte asociada | [CONFIRMADO VISUALMENTE] |
| `fecha_inhabilitacion` | Timestamp | Fecha programada de inhabilitación | [CONFIRMADO VISUALMENTE] |
| `usuario_inhabilitacion`| Varchar(100) | Usuario que ordenó la inhabilitación | [CONFIRMADO VISUALMENTE] |
| `fecha_real_inhabilitacion` | Timestamp | Fecha real ejecutada | [CONFIRMADO VISUALMENTE] |
| `registrado_por` | Varchar(100) | Operador que asienta el registro | [CONFIRMADO VISUALMENTE] |
| `registrado_en` | Timestamp | Timestamp de auditoría | [CONFIRMADO VISUALMENTE] |
| `observacion` | Text | Comentarios o notas de campo | [CONFIRMADO VISUALMENTE] |

---
title: "Entidad: Rehabilitación y Reconexión"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "cut-order.md"
  - "../../05-business-rules/BR-007-reconversion-priority.md"
---

# Rehabilitación y Reconexión (`REHABILITACION_RECONEXION`)

## Propósito

Audita y controla el restablecimiento físico del servicio eléctrico tras la regularización financiera del suministro suspendido.

## Descripción

Visible en el panel inferior de la ficha P-04. Registra si la reconexión fue manual, quién emitió la orden de reposición, la fecha/hora de reposición efectiva y el técnico responsable.

## Campos

| Campo | Tipo Técnico | Descripción | Confianza |
| --- | --- | --- | --- |
| `orden_corte_id` | Integer [FK/PK] | Orden de corte origen | [CONFIRMADO VISUALMENTE] |
| `es_reconexion_manual` | Boolean | Flag que indica si fue forzada manualmente | [CONFIRMADO VISUALMENTE] |
| `orden_emitida_por` | Varchar(100) | Usuario o sistema emisor de la reposición | [CONFIRMADO VISUALMENTE] |
| `orden_emitida_el` | Timestamp | Timestamp de emisión de la orden de reposición | [CONFIRMADO VISUALMENTE] |
| `fecha_reposicion` | Timestamp | Fecha y hora en que se levantó físicamente el corte | [CONFIRMADO VISUALMENTE] |
| `tecnico_reposicion` | Varchar(100) | Nombre del liniero que reenergizó el medidor | [CONFIRMADO VISUALMENTE] |
| `rehabilitacion_registrado_por` | Varchar(100) | Usuario que digitó la rehabilitación | [CONFIRMADO VISUALMENTE] |
| `rehabilitacion_registrado_en` | Timestamp | Timestamp de persistencia del registro | [CONFIRMADO VISUALMENTE] |

## Reglas Relacionadas

- [BR-007: Prioridad de Reconversión / Otros Ingresos](../../05-business-rules/BR-007-reconversion-priority.md)

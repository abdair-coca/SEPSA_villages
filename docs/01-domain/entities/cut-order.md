---
title: "Entidad: Orden de Corte"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "account.md"
  - "cut-execution.md"
  - "suspension-audit.md"
  - "reconnection.md"
  - "debt-invoice.md"
  - "../../05-business-rules/BR-001-minimum-threshold.md"
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
---

# Orden de Corte (`ORDEN_CORTE`)

## Propósito

Representa la orden administrativa y operativa emitida por SEPSA para suspender el servicio eléctrico de un suministro en mora.

## Descripción

Se identifica unívocamente mediante el **CUC (Código Único de Corte)** o número de registro. Posee un ciclo de vida con estados formales (`GENERADO`, `EJECUTADO`, `ANULADO`, `RECONEXIÓN`), congela el saldo adeudado al momento de su creación y registra el motivo de cancelación si el cliente paga antes de la desconexión física.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `nro_registro` | Integer [PK] | Código Único de Corte (C.U.C.) | Ej. 443794, 443797 | [CONFIRMADO VISUALMENTE] |
| `cuenta_id` | Integer [FK] | Cuenta sujeta a suspensión | FK a `CUENTA_SUMINISTRO` | [CONFIRMADO VISUALMENTE] |
| `estado_corte` | Varchar(20) | Estado actual de la orden | `GENERADO`, `EJECUTADO`, `ANULADO`, `RECONEXIÓN` | [CONFIRMADO VISUALMENTE] |
| `fecha_generacion` | Timestamp | Fecha y hora exacta de emisión | Ej. 27/08/2026 12:33:00 | [CONFIRMADO VISUALMENTE] |
| `deuda_mes_tope` | Decimal(12,4) | Saldo total congelado al corte | Expresado en Bolivianos (Bs) | [CONFIRMADO VISUALMENTE] |
| `usuario_asignado_id` | Integer [FK] | Operador o cuadrilla despachada | FK a `USUARIO_SISTEMA` (o null si sin asignar) | [CONFIRMADO VISUALMENTE] |
| `motivo_anulacion` | Text | Causa y fecha de anulación automática | Ej. 'Anulado ya que pago parte o la totalidad...' | [CONFIRMADO VISUALMENTE] |

## Relaciones

- Se emite sobre una `CUENTA_SUMINISTRO` (N:1).
- Es asignada a un `USUARIO_SISTEMA` (N:1).
- Tiene una ejecución material en `EJECUCION_CORTE` (1:1 condicional).
- Audita su baja en `SUSPENSION_REGISTRO` (1:1).
- Se restablece mediante `REHABILITACION_RECONEXION` (1:1).
- Almacena evidencias en `ADJUNTO_CORTE` (1:N).

## Reglas Relacionadas

- [BR-001: Umbral Mínimo](../../05-business-rules/BR-001-minimum-threshold.md)
- [BR-002: Exclusión de Intereses](../../05-business-rules/BR-002-interest-exclusion.md)
- [BR-003: Anulación Automática](../../05-business-rules/BR-003-concurrent-payment-cancellation.md)
- [BR-007: Prioridad de Reconversión](../../05-business-rules/BR-007-reconversion-priority.md)

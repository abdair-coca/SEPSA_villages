---
id: "FLOW-004"
title: "Flujo 4: Reconexión y Restablecimiento del Servicio"
type: "flow"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-006-reconnection-management.md"
  - "../../05-business-rules/BR-007-reconversion-priority.md"
  - "../../01-domain/entities/reconnection.md"
---

# FLOW-004: Reconexión y Restablecimiento del Servicio

## Objetivo

Restablecer legal y técnicamente el suministro eléctrico suspendido una vez que el usuario ha cancelado su deuda y los aranceles de reposición.

## Actor

Cajero / Supervisor / Liniero en Terreno.

## Precondiciones

Suministro con orden en estado `EJECUTADO` (desenergizado).

## Pasos del Flujo

1. **Pago de Deuda y Aranceles**: El usuario abona en cobranzas el total de facturas pendientes y los aranceles de reconexión facturados bajo el concepto "Otros Ingresos".
2. **Validación de Reconversión ([BR-007](../../05-business-rules/BR-007-reconversion-priority.md))**: El sistema valida que no existan saldos pendientes en "Otros Ingresos".
3. **Emisión de Reposición**: Se genera el registro en `REHABILITACION_RECONEXION` asignando un liniero.
4. **Reposición Física**: La cuadrilla acude al medidor, retira el bloqueo material y reconecta el servicio.
5. **Cierre de Ciclo**: Se asienta la fecha de reposición física; la orden transiciona al estado `RECONEXIÓN` y el suministro retorna a estado normal activo.

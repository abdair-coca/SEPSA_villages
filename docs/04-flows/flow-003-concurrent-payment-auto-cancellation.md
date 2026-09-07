---
id: "FLOW-003"
title: "Flujo 3: Anulación Automática de Orden por Cobranza Concurrente"
type: "flow"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-005-concurrent-payment-cancellation.md"
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
  - "../../01-domain/entities/cut-order.md"
---

# FLOW-003: Anulación Automática de Orden por Cobranza Concurrente

## Objetivo

Impedir que se ejecute una suspensión en terreno si el cliente regulariza sus planillas impagas en ventanilla de cobranzas o canales bancarios.

## Actor

Cajero Comercial / Proceso Automatizado del Sistema.

## Precondiciones

Orden de corte en estado `GENERADO` pendiente de ejecución en campo.

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    autonumber
    actor Cli as Cliente
    actor Caj as Cajero (cobros.sepsa.web.bo)
    participant Cobros as Módulo de Cobranzas
    participant Core as Base de Datos SEPSA
    participant Cortes as Sistema de Cortes (cortes.sepsa.net.bo)

    Cli->>Caj: Presenta cuenta y cancela facturas adeudadas
    Caj->>Cobros: Asienta cobro de facturas
    Cobros->>Core: Actualiza FACTURA_DEUDA (estado pasa de 'P' a 'C')
    Core->>Cortes: Emite evento / trigger de cobro registrado
    Cortes->>Cortes: Evalúa si existe orden en estado 'GENERADO'
    alt Orden Activa Encontrada
        Cortes->>Core: Actualiza ORDEN_CORTE a estado 'ANULADO'
        Cortes->>Core: Graba motivo: "Anulado ya que pago parte o la totalidad... Fecha: [timestamp]"
        Cortes-->>Cortes: Retira orden de la bandeja activa /verCortes
    end
    Caj-->>Cli: Emite comprobante de pago oficial
```

## Casos de Prueba Derivados (TDD)

- `TC-FLOW-003-01`: Transición inmediata de `GENERADO` a `ANULADO` al registrarse el pago.
- `TC-FLOW-003-02`: Preservación inmutable de la orden con su traza de auditoría y motivo de anulación.
- `TC-FLOW-003-03`: Desaparición automática de la orden anulada en la bandeja de trabajo de cuadrillas.

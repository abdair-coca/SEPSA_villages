---
title: "Estados y Ciclos de Vida"
type: "data-model"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "er-diagram.md"
  - "../../05-business-rules/BR-003-concurrent-payment-cancellation.md"
---

# Estados y Ciclos de Vida

## Ciclo de Vida de la Orden de Corte (`ORDEN_CORTE`)

```
+-----------------------------------+
|      Identificación de Mora       |
| (>= 2 Facturas con mora > 30 días)|
+-----------------------------------+
                  |
                  v [Acción: Crear Orden de Corte]
        +-------------------+
        |     GENERADO      | <-------------+
        +-------------------+               |
         /        |        \                |
        /         |         \               |
       /          |          \              |
[Pago en Ventanilla] |     [Corte Efectivo] |
     /            |            \            |
    v             |             v           |
+-------------+   |      +-------------+    |
|   ANULADO   |   |      |  EJECUTADO  |    |
+-------------+   |      +-------------+    |
                  |             |           |
                  |    [Pago Total Deuda +  |
                  |     Derecho Reposición] |
                  |             |           |
                  |             v           |
                  |      +-------------+    |
                  +----> | RECONEXIÓN  | ---+ (Nuevo Ciclo)
                         +-------------+
```

| Estado | Significado Funcional | Acción Disparadora | Condiciones Previas | Consecuencias en el Sistema |
| --- | --- | --- | --- | --- |
| **GENERADO** | Orden emitida y asignable a cuadrillas. | Clic en "Crear orden de corte" en P-02. | Suministro activo con $\ge 2$ facturas impagas $> 30$ días. | Aparece en P-03 con badge rojo y en capas de morosos de QField. |
| **EJECUTADO** | Suministro suspendido materialmente en terreno. | Envío del formulario modal P-05. | Orden en estado GENERADO. Liniero en el suministro. | Suministro queda desenergizado; habilita cobro de arancel de reconexión. |
| **ANULADO** | Cancelación automática de la suspensión. | Detección de pago de planillas en caja/banco. | Orden en estado GENERADO y pago registrado en cobros. | Se retira de la cola de trabajo y se asienta la traza con fecha y hora. |
| **RECONEXIÓN** | Servicio restablecido físicamente. | Registro en panel Datos de Reconexión. | Suministro con deuda cancelada y orden de reposición generada. | El cliente vuelve al estado normal activo sin órdenes pendientes. |

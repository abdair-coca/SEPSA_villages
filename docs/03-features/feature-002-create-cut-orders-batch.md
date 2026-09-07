---
title: "Feature F-002: Emisión Masiva de Lotes de Corte"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "feature-001-filter-delinquent-customers.md"
  - "feature-003-cut-orders-tray-management.md"
  - "../../01-domain/entities/cut-order.md"
---

# F-002: Emisión Masiva de Lotes de Corte

## Objetivo

Generar formalmente un lote transaccional de órdenes de corte para todas las cuentas morosas resultantes de una búsqueda territorial.

## Actor

Supervisor / Operador de Cortes.

## Flujo Principal

1. Tras obtener resultados en la tabla `T-01`, el operador pulsa el botón rojo destacado "Crear orden de corte".
2. El sistema valida la existencia de al menos un registro.
3. Para cada cuenta de la lista, inserta una tupla en `ORDEN_CORTE`:
   - Asigna un número de registro unívoco C.U.C.
   - Fija el estado en `GENERADO`.
   - Registra el timestamp actual `fecha_generacion`.
   - Congela el importe total impago en `deuda_mes_tope`.
4. El sistema redirige automáticamente a la bandeja `/verCortes` (`P-03`).

## Casos de Prueba Potenciales (TDD)

- `TC-F002-01`: Generación de CUC secuencial no repetido.
- `TC-F002-02`: Creación de orden en estado exacto 'GENERADO'.
- `TC-F002-03`: Congelamiento exacto de saldo adeudado en `deuda_mes_tope`.

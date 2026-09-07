---
id: "FLOW-001"
title: "Flujo 1: Filtrado de Morosidad y Emisión de Lote de Corte"
type: "flow"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-001-filter-delinquent-customers.md"
  - "../../03-features/feature-002-create-cut-orders-batch.md"
  - "../../05-business-rules/BR-001-minimum-threshold.md"
  - "../../07-ui/screens/P-02-delinquency-search.md"
---

# FLOW-001: Filtrado de Morosidad y Emisión de Lote de Corte

## Objetivo

Identificar suministros en mora crítica en una ruta de distribución y generar formalmente las órdenes de corte para despacho a cuadrillas.

## Actor

Supervisor de Cortes / Operador Comercial.

## Evento Inicial

Navegación a `/orden/create` (`P-02`) desde el Dashboard.

## Precondiciones

Operador autenticado con rol de cortes en `cortes.sepsa.net.bo`.

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    autonumber
    actor Op as Supervisor de Cortes
    participant Web as /orden/create (P-02)
    participant Core as Backend SEPSA
    participant DB as Base de Datos (FA_FACTURAS)

    Op->>Web: Selecciona Área (ej. B - BETANZOS)
    Web->>Core: Solicita localidades de Betanzos
    Core-->>Web: Retorna lista de localidades
    Op->>Web: Selecciona Localidad (002 - MOJOTORILLO)
    Web->>Core: Solicita rutas de Mojotorillo
    Core-->>Web: Retorna lista de rutas
    Op->>Web: Selecciona Ruta (002) y Umbral Facturas (2)
    Op->>Web: Clic en "Buscar"
    Web->>Core: Query de morosos (Mora > 30 días, Estado = 'A')
    Core->>DB: Consulta facturas impagas agrupadas por cuenta
    DB-->>Core: Retorna registros coincidentes
    Core-->>Web: Renderiza Tabla T-01 con resultados
    Op->>Web: Clic en "Crear orden de corte"
    Web->>Core: Invoca creación de lote de corte
    Core->>DB: Inserta tuplas en ORDEN_CORTE (estado GENERADO, CUC, saldo tope)
    DB-->>Core: Confirmación de persistencia
    Core-->>Web: Redirección automática a /verCortes (P-03)
```

## Decisiones y Flujos Alternativos

- **Sin Resultados**: Si la consulta retorna 0 registros, el sistema muestra un mensaje informativo y deshabilita el botón de emisión masiva.
- **Auditoría Previa**: El operador puede pulsar "Ver Kardex" en cualquier fila antes de emitir para auditar las planillas del cliente.

## Casos de Prueba Derivados (TDD)

- `TC-FLOW-001-01`: Carga asíncrona de combos dependientes (Área $ightarrow$ Localidad $ightarrow$ Ruta).
- `TC-FLOW-001-02`: Inserción masiva de tuplas en `ORDEN_CORTE` con estado `GENERADO`.

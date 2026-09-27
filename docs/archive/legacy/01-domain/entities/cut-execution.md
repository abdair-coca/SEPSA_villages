---
title: "Entidad: Ejecución Material de Corte"
type: "entity"
status: "mixed"
confidence: "high"
source: "master-analysis"
related:
  - "cut-order.md"
  - "../../05-business-rules/BR-004-gps-mandatory-with-bypass.md"
  - "../../05-business-rules/BR-005-photo-evidence-with-bypass.md"
---

# Ejecución Material de Corte (`EJECUCION_CORTE`)

## Propósito

Almacena los datos técnicos, geográficos y métricos capturados por el liniero en el momento exacto de consumar la desconexión física en campo.

## Descripción

Capturada a través del modal P-05. Registra el punto físico de apertura del circuito, la lectura del registrador de kWh, la presencia de medidores vecinos y las coordenadas GPS obtenidas del dispositivo móvil, permitiendo omisiones controladas (bypasses).

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `orden_corte_id` | Integer [FK/PK] | Orden de corte asociada | FK a `ORDEN_CORTE` | [ALTAMENTE INFERIDO] |
| `tipo_corte` | Varchar(30) | Método físico de desconexión | `RED`, `MEDIDOR`, `BARRAS`, `PROTECCION`, `ACOMETIDA`, `FUSIBLES` | [CONFIRMADO VISUALMENTE] |
| `lectura_corte` | Decimal(12,2) | Lectura final en kWh al momento del corte | Numérico (ej. 1234.00) | [CONFIRMADO VISUALMENTE] |
| `medidores_cercanos` | Boolean | Existencia de otros medidores contiguos | SI / NO | [CONFIRMADO VISUALMENTE] |
| `saltar_control_fotos` | Boolean | Bypass de fotos por contingencia técnica | SI / NO (default NO) | [CONFIRMADO VISUALMENTE] |
| `saltar_control_coordenadas` | Boolean | Bypass de GPS por falta de señal satelital | SI / NO (default NO) | [CONFIRMADO VISUALMENTE] |
| `latitud_ejecucion` | Decimal(11,8) | Latitud WGS84 capturada en vivo | Grados decimales (ej. -19.589366) | [CONFIRMADO VISUALMENTE] |
| `longitud_ejecucion` | Decimal(11,8) | Longitud WGS84 capturada en vivo | Grados decimales (ej. -65.259119) | [CONFIRMADO VISUALMENTE] |

## Reglas Relacionadas

- [BR-004: Obligatoriedad de Georreferenciación con Excepción](../../05-business-rules/BR-004-gps-mandatory-with-bypass.md)
- [BR-005: Excepción Controlada de Evidencia Fotográfica](../../05-business-rules/BR-005-photo-evidence-with-bypass.md)

## Evidencia

- Minutos 09:21 a 11:35 en el modal P-05 de la orden `443794`.

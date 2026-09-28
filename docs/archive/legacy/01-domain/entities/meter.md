---
title: "Entidad: Medidor"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "account.md"
  - "cut-execution.md"
---

# Medidor (`MEDIDOR`)

## Propósito

Modela el equipo de medición de consumo de energía eléctrica en kWh instalado en el suministro.

## Descripción

Registra el número de serie de fábrica, marca del fabricante, multiplicador de pulsos y el índice técnico del medidor. Es el activo físico sobre el cual se lee la desconexión material en campo.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `nro_medidor` | Varchar(30) [PK] | Número de serie impreso en la placa | Alfanumérico (ej. 240907792, 221009296) | [CONFIRMADO VISUALMENTE] |
| `marca` | Varchar(50) | Fabricante del equipo de medición | Ej. 'WASION' | [CONFIRMADO VISUALMENTE] |
| `multiplicador` | Integer | Factor multiplicador de lectura | Valor por defecto 1 | [CONFIRMADO VISUALMENTE] |
| `indice_medidor`| Varchar(20) | Código de índice o tipo de medidor | Visible en ficha P-04 | [CONFIRMADO VISUALMENTE] |

## Relaciones

- Instalado unívocamente en una `CUENTA_SUMINISTRO` (1:1) [CONFIRMADO VISUALMENTE].
- Registrado en la intervención en `EJECUCION_CORTE` a través de la lectura final [CONFIRMADO VISUALMENTE].

## Evidencia

- Minutos 01:45, 03:31, 08:46, y en QField 19:15 (`C:361499 M:221009296 WASION`).

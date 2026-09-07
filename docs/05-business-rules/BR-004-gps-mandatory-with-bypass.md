---
id: "BR-004"
title: "Obligatoriedad de Georreferenciación con Excepción Controlada"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-004-execute-field-cut.md"
  - "../../01-domain/entities/cut-execution.md"
---

# BR-004: Obligatoriedad de Georreferenciación con Excepción Controlada

## Regla

El registro formal de corte exige capturar las coordenadas GPS (Latitud y Longitud WGS84) del punto físico de corte. Si la cuadrilla opera en áreas sin señal satelital o con fallas de hardware, el sistema permite confirmar la operación activando explícitamente el interruptor **`¿Saltar Control de Coordenadas? = SI`**.

## Entidades Afectadas

- `EJECUCION_CORTE` (`latitud_ejecucion`, `longitud_ejecucion`, `saltar_control_coordenadas`)

## Evidencia Visual

Modal P-05 (minuto 10:50). Selector desplegable y validación en cliente.

## Casos de Prueba (TDD)

- `TC-BR-004-01`: Bloquear guardado si Latitud/Longitud están vacías y `saltar_control_coordenadas = NO`.
- `TC-BR-004-02`: Permitir guardado con Latitud/Longitud vacías si `saltar_control_coordenadas = SI`.

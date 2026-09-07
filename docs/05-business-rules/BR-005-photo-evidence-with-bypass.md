---
id: "BR-005"
title: "Excepción Controlada de Evidencia Fotográfica"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../03-features/feature-004-execute-field-cut.md"
  - "../../01-domain/entities/cut-attachment.md"
---

# BR-005: Excepción Controlada de Evidencia Fotográfica

## Regla

El protocolo estándar exige adjuntar fotografías del medidor/acometida cortada. Ante impedimentos de hardware, cámara o conectividad, el operador puede omitir el requisito activando **`¿Saltar Control de Fotos? = SI`**.

## Entidades Afectadas

- `EJECUCION_CORTE` (`saltar_control_fotos`)
- `ADJUNTO_CORTE`

## Evidencia Visual

Modal P-05 (minuto 10:47). Selector desplegable.

## Casos de Prueba (TDD)

- `TC-BR-005-01`: Omitir validación de archivo obligatorio si `saltar_control_fotos = SI`.

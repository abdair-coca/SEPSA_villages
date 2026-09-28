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

El protocolo estándar exige adjuntar fotografías del medidor/acometida cortada. El modal mantiene visible el selector **`¿Saltar Control de Fotos?`** para registrar una excepción ante impedimentos de hardware, cámara o conectividad. Si se selecciona `SI`, el sistema permite omitir el requisito.

Las fotografías se optimizan localmente antes de cargarse: las imágenes se redimensionan hasta un máximo de 5 megapíxeles y se comprimen para reducir el tiempo de transferencia. PDF, DOC y DOCX no se transforman.

## Entidades Afectadas

- `EJECUCION_CORTE` (`saltar_control_fotos`)
- `ADJUNTO_CORTE`

## Evidencia Visual

Modal P-05 (minuto 10:47). Selector desplegable.

## Casos de Prueba (TDD)

- `TC-BR-005-01`: Omitir validación de archivo obligatorio si `saltar_control_fotos = SI`.

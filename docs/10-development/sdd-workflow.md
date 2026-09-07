---
title: "Flujo de Trabajo SDD (Specification Driven Development)"
type: "development"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "architecture-decisions.md"
  - "tdd-workflow.md"
---

# Flujo de Trabajo SDD (Specification Driven Development)

Para implementar cualquier funcionalidad sin introducir suposiciones ni inventar reglas:

```
[Base de Conocimiento /docs]
             │
             ▼
1. Lectura de Contexto (Módulo + Entidades + Reglas)
             │
             ▼
2. Creación de Especificación Formal en /specs/{feature}/
   - specification.md
   - acceptance-criteria.md
   - tasks.md
             │
             ▼
3. Validación contra Restricciones y Reglas de Negocio
             │
             ▼
4. Aprobación y Fase TDD (Escribir Tests Fallidos)
             │
             ▼
5. Implementación del Código Mínimo Necesario
```

## Reglas Inmutables para Agentes de Código

1. **No Inventar Campos**: Si una entidad no documenta un campo en `06-data-model/fields-catalog.md`, clasificarlo como `UNKNOWN` antes de agregarlo al esquema.
2. **Prioridad de Evidencia**: Confirmado Visualmente > Altamente Inferido > Hipótesis.
3. **Respetar Bypasses**: Todo flujo de terreno debe admitir las excepciones `saltar_control_fotos` y `saltar_control_coordenadas`.

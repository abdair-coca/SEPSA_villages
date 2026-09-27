---
title: "Feature F-004: Registro de Ejecución Material de Corte en Terreno"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../05-business-rules/BR-004-gps-mandatory-with-bypass.md"
  - "../../05-business-rules/BR-005-photo-evidence-with-bypass.md"
  - "../../07-ui/screens/P-05-cut-execution-modal.md"
---

# F-004: Registro de Ejecución Material de Corte en Terreno

## Objetivo

Registrar fehacientemente en campo los datos técnicos y métricos de la suspensión física del suministro eléctrico.

## Actor

Liniero de Cuadrilla / Técnico en Terreno.

## Flujo Principal

1. El liniero accede a la ficha `/corte/{id}` (`P-04`) y pulsa "Registrar corte efectivo".
2. Se abre el modal `P-05` con el técnico autoasignado.
3. Pulsa "Obtener ubicación" para llenar Latitud y Longitud vía GPS del navegador.
4. Digita el teléfono de contacto del cliente si lo obtiene.
5. Indica si existen medidores vecinos (`medidores_cercanos = SI/NO`).
6. Selecciona el Tipo de Corte (`RED`, `MEDIDOR`, `BARRAS`, `PROTECCION`, `ACOMETIDA`, `FUSIBLES`).
7. Digita la lectura final acumulada en el medidor (kWh).
8. Pulsa "Registrar corte efectivo". El sistema persiste `EJECUCION_CORTE` y pasa la orden a `EJECUTADO`.

## Bypasses Administrativos

- `saltar_control_coordenadas = SI`: Permite confirmar el corte si no hay señal satelital GPS.
- `saltar_control_fotos = SI`: Permite confirmar sin subir fotografías de respaldo.

## Casos de Prueba Potenciales (TDD)

- `TC-F004-01`: Bloqueo de confirmación si latitud/longitud están vacías y bypass está en 'NO'.
- `TC-F004-02`: Permitir guardado si GPS está vacío pero bypass está en 'SI'.
- `TC-F004-03`: Transición de estado de la orden de 'GENERADO' a 'EJECUTADO'.

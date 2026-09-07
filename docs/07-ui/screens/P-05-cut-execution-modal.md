---
id: "P-05"
title: "Pantalla P-05: Modal Formulario de Registro de Corte Efectivo"
type: "screen"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "P-04-cut-file.md"
  - "../../05-business-rules/BR-004-gps-mandatory-with-bypass.md"
  - "../../05-business-rules/BR-005-photo-evidence-with-bypass.md"
---

# Pantalla P-05: Modal Formulario de Registro de Corte Efectivo

## Propósito

Formulario emergente modal para registrar el acto material de desconexión física en campo.

## Campos del Formulario

| Campo / Label | Tipo de Control | Oblig. | Valores / Rango | Comportamiento |
| --- | --- | --- | --- | --- |
| **Latitud** | Text input | Sí* | Grados WGS84 (ej. `-19.589366`) | Se puebla al pulsar botón "Obtener ubicación". |
| **Longitud** | Text input | Sí* | Grados WGS84 (ej. `-65.259119`) | Se puebla junto con latitud vía Geolocation API. |
| **Teléfono de Contacto** | Text/Tel input | No | Cadena numérica (ej. `61635733`) | Permite actualizar el celular del usuario en corte. |
| **¿Tiene Medidores Cercanos?** | Select | Sí | `SI`, `NO` | Identifica si hay más medidores en la pared/poste. |
| **Técnico para asignar corte** | Readonly text | Sí | Nombre del usuario logueado | Autoasignado al operador autenticado actual. |
| **Tipo de Corte** | Select | Sí | `RED`, `MEDIDOR`, `BARRAS`, `PROTECCION`, `ACOMETIDA`, `FUSIBLES` | Punto físico donde se desenergizó. |
| **Lectura del Corte** | Number input | Sí | Decimal/Entero (kWh) | Placeholder: `"Ej 1234567"`. Lectura del medidor. |
| **¿Saltar Control de Fotos?** | Select | Sí | `NO` (default), `SI` | Bypass administrativo de fotografías. |
| **¿Saltar Control de Coordenadas?** | Select | Sí | `NO` (default), `SI` | Bypass administrativo de geolocalización. |

*Nota: Latitud y Longitud son obligatorios salvo que `saltar_control_coordenadas = SI`.

## Botones de Pie

- **Cerrar**: Cancela el modal.
- **Registrar corte efectivo** (rojo): Persiste los datos y actualiza la orden a `EJECUTADO`.

## Evidencia

Video: 09:21 - 11:35.

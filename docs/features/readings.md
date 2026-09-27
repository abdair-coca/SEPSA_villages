# Lecturas y evidencia

## Objetivo

Conservar una captura de campo verificable, vinculada al medidor y a la operación concreta.

## Reglas

- La lectura final es obligatoria para confirmar un corte.
- Debe indicar medidor, valor, unidad `kWh`, fecha y estado `CAPTURED`.
- El valor debe ser finito y no negativo; no se inventan lecturas.
- La evidencia fotográfica debe ser JPEG o PNG, estar optimizada y quedar ligada a orden, operación, técnico y dispositivo.
- Si no se puede capturar GPS o foto, solo se permite la excepción controlada con motivo no vacío.
- Las coordenadas, precisión, evidencia y excepciones quedan en el historial; no se reemplazan silenciosamente.

## Persistencia

Los borradores se guardan localmente para sobrevivir a cierres o recargas. La operación final se confirma al usuario después de persistir registro, evidencia y cola. El sync actual envía referencias/metadatos de evidencia; los archivos permanecen en el dispositivo hasta definir el contrato oficial.

## Pendientes

Umbrales y políticas de validación, privacidad y retención: `TODO: VALIDAR CON SEPSA`.

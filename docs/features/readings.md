# Lecturas y evidencia

## Objetivo

Conservar una captura de campo verificable, vinculada al medidor y a la operación concreta.

## Reglas

- La lectura final es obligatoria para confirmar un corte.
- Debe indicar medidor, valor, unidad `kWh`, fecha y estado `CAPTURED`.
- El valor debe ser finito y no negativo; no se inventan lecturas.
- La evidencia fotográfica debe ser JPEG o PNG, estar optimizada y quedar ligada a orden, operación, técnico y dispositivo.
- Si no se puede capturar GPS o foto, solo se permite la excepción controlada con motivo no vacío.
- La evidencia local conserva bytes y estado de carga: `pending`, `uploading`, `verified`, `failed` o `review-required`. Un fallo conserva el blob para reintento.
- El backend piloto recomputa SHA-256; coincidencia de hash no basta si orden, operación, técnico o dispositivo no coinciden.
- Las coordenadas, precisión, evidencia y excepciones quedan en el historial; no se reemplazan silenciosamente.

## Persistencia

Los borradores se guardan localmente para sobrevivir a cierres o recargas. La operación final se confirma al usuario después de persistir registro, evidencia y cola. El adaptador `PILOT_PROVISIONAL` carga bytes antes del corte y acepta recibo solo con el mismo identificador/hash; ACK perdido se resuelve con reintento idempotente. La política oficial de almacenamiento y retención sigue pendiente.

## Pendientes

Umbrales y políticas de validación, privacidad y retención: `TODO: VALIDAR CON SEPSA`.

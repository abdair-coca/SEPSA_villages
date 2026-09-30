# Sincronización

## Objetivo

Enviar operaciones locales sin perderlas, duplicarlas ni convertir un resultado incierto en éxito.

## Flujo

1. Validar la acción localmente.
2. Guardar entidad, registro y `operationId` de forma atómica en IndexedDB.
3. Mostrar “guardado en dispositivo” si aún no hay confirmación remota.
4. Enviar una operación física pendiente una sola vez cuando la conectividad sea utilizable.
5. Marcar `synced` solo con un recibo ligado a la operación, orden, técnico, dispositivo, versión de autorización y captura guardada.
6. Ante respuesta perdida, timeout, respuesta ambigua o conflicto, persistir `PHYSICAL_UNKNOWN` y consultar estado; ningún resultado de lookup permite otro POST.

## Estados

`pending`, `syncing`, `synced` y `failed`. Cada elemento conserva intentos, error, operación, orden y si requiere revisión manual.

## Reglas

- La cola sobrevive a recarga, cierre, reinicio y pérdida de red.
- Cada operación tiene un identificador único y payload estable.
- El backend verifica sesión, alcance del técnico, versión, hash/idempotencia y auditoría.
- Antes de consumir autorización de CUT, el backend vuelve a consultar `PaymentAuthority` dentro de la transacción. Solo `CLEAR` confirma. `PAYMENT_CONFIRMED` se guarda como observación append-only y deja operación en `conflict`; `UNKNOWN`, timeout y error también dejan conflicto para revisión. Ninguno consume autorización ni reintenta corte.
- Conflictos se conservan; no usar última escritura gana.
- Operaciones inciertas o marcadas para revisión no se reenvían automáticamente.
- `CLAIMED` significa intención física durable local; no representa confirmación remota.
- `CONFIRMED` requiere ACK íntegro o lookup con recibo exacto. Un registro legacy sin campos de recibo suficientes queda `unknown`.
- Lookup `not_found`, `unknown`, error, conflicto o recibo distinto mantiene revisión incierta. Repetir `syncOnce`, reconectar, recargar o recuperar un lease vencido nunca reenvía ese corte.
- Las transiciones físicas locales son append-only y se escriben en la misma transacción IndexedDB que operación, orden y cola. El upgrade crea el almacén de transiciones sin inferir historia legacy.
- `orderVersion` enviado y recibido es la versión esperada fijada por la autorización de esa captura; las versiones before/after del historial describen CAS locales y no reemplazan esa versión autoritativa. Una visita sincronizada no incrementa la versión ni bloquea solicitar autorización del corte; `CLAIMED`, `PHYSICAL_UNKNOWN` y `CONFIRMED` impiden otra ejecución para esa orden.
- Ninguna operación se elimina solo por un fallo de red.

## Revisión humana ADMIN

El piloto provisional expone `POST /v1/sync/operations/{operation_id}/review`. Requiere `order_id`, `technician_id`, `device_id`, `expected_version` y un `reason` no vacío (máximo 1000 caracteres). El servidor comprueba rol ADMIN, asignación, identidad y versión bajo transacción. Si el lookup remoto no confirma la operación (por ejemplo, `not_found`), la revisión cambia el estado físico de la orden a `PHYSICAL_UNKNOWN` y aumenta su versión de `expected_version` a `expected_version + 1`; conserva el estado de negocio de la orden y agrega `HUMAN_REVIEW_RECORDED` con actor, dispositivo, fecha del servidor, motivo y transición.

Registrar una revisión no confirma el corte, no autoriza otra ejecución y no permite reenviar el POST. Solo un recibo remoto íntegro puede confirmar. Para request/response exactos y errores ver [contrato piloto](../api/pilot-contract.md). Esta ruta es `PILOT_PROVISIONAL`, no API oficial de SEPSA; política de conciliación oficial queda `TODO: VALIDAR CON SEPSA`.

## Componentes involucrados

`LocalRepository`, `SyncEngine`, `SyncTransport`, IndexedDB, `HttpPilotClient` y endpoints provisionales del backend.

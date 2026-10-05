# Sincronización

## Objetivo

Enviar operaciones locales sin perderlas, duplicarlas ni convertir un resultado incierto en éxito.

## Flujo

1. Validar la acción localmente.
2. Guardar entidad, registro y `operationId` de forma atómica en IndexedDB.
3. Mostrar “guardado en dispositivo” si aún no hay confirmación remota.
4. Cuando hay conexión útil, subir primero blobs locales de un CUT con foto.
5. Enviar CUT solo después de recibo de upload verificado ligado a operación, orden, técnico y dispositivo.
6. Marcar `synced` solo con recibo ligado a operación, orden, técnico, dispositivo, versión de autorización y captura guardada.
7. Ante respuesta perdida, timeout, respuesta ambigua o conflicto, persistir `PHYSICAL_UNKNOWN` y consultar estado; ningún resultado de lookup permite otro POST.

## Estados

`pending`, `syncing`, `synced` y `failed`. Cada elemento conserva intentos, error, operación, orden y si requiere revisión manual.

Evidencia conserva estado propio: `pending`, `uploading`, `verified`, `failed` o `review-required`. Fallo/interrupción conserva bytes y evita POST CUT. Reintento usa mismo ID y binding; backend devuelve mismo recibo solo para mismo contenido y hash. CUT con foto se acepta solo cuando todas sus referencias están verificadas dentro de la transacción de aceptación. Excepción controlada sin foto conserva motivo en payload y auditoría.

Una nueva reclamación CUT guarda `cutSendPhase: preparing` en la misma transacción local. Antes de cargar o enviar, solo se procesa una CUT cuyo estado local confirma el ciclo de autorización esperado: intención reclamada con consumo diferido, o resultado físico confirmado con consumo inmediato. Antes del POST, IndexedDB vuelve a verificar propietario, token y lease vigente, ese estado de autorización y la evidencia verificada, y guarda `send-started`. El backend decide si la autorización todavía está vigente al aceptar CUT. Las escrituras de carga también comprueban el lease; un trabajador vencido no puede enviar CUT ni degradar evidencia verificada. Sin adaptador de carga, un CUT con referencias queda pendiente de reintento sin POST.

## Reposición SC08: persistencia y sincronización

La app conserva `RECONNECTION` en los almacenes existentes `operations` y `sync`. El modo conectado solicita y consume una habilitación piloto; luego envía la operación al backend. La UI muestra el resultado local y solo presenta confirmación remota tras un ACK íntegro.

`OperationRecord.operationId` identifica la acción y la fila de cola; sus campos SC08 guardan `effectiveAt`, `technicianId`, el snapshot del nombre histórico y `demora` para reconexión. El estado de entrega puede cambiar sin editar estos datos. `physicalTransitions` sigue describiendo cambios de estado/versiones y los campos legacy `reconnection_date` y `reconnection_technician` del suministro no sustituyen el registro por operación.

### Contrato piloto vigente

- El servidor reutiliza la tabla de habilitaciones existente con `action=RECONNECTION`; una migración aditiva amplía los constraints existentes de orden/sync y añade índices, sin tabla de eventos.
- Reserva/consumo verifica rol `TECHNICIAN`, asignación, estado/version de orden, dispositivo, `operationId` único, token de un solo uso y snapshot de nombre del servidor. El sync vuelve a comprobar el vínculo de habilitación consumida, el ciclo CUT único, `effectiveAt`, `demora` y evidencia/excepción vinculada.
- Operación, orden y cola local se actualizan en transacciones IndexedDB ya existentes. El backend persiste el payload en `sync_operations` y agrega auditoría. Replay idéntico del mismo `operationId` devuelve recibo sin incrementar otra vez la versión; contenido distinto produce conflicto.
- Los registros `INTENT_PERSISTED` o `PHYSICAL_UNKNOWN` recuperan la habilitación con el mismo `operationId`; si no se puede demostrar consumo, permanecen inciertos y no se envía una reposición como confirmada.
- `WorkOrder.version` representa CAS local y puede avanzar por claim/confirmación; `WorkOrder.authoritativeVersion` guarda la última versión del backend. El ACK avanza la versión autoritativa una vez, sin volver a incrementar el contador local. Detalle en [D011](../DECISIONS.md#d011--version-local-y-version-autoritativa-del-backend).

El `orderId` identifica un ciclo con un CUT confirmado y, cuando ocurre, su RECONNECTION; el vínculo no se elige por fecha. El criterio sin identidad/tabla duplicada está en [D010](../DECISIONS.md#d010--ciclo-de-corte-y-reposicion-sin-identidad-duplicada).

Un fallo de sync puede reintentarse con el mismo `operationId` sin tocar los datos físicos. Si el dato físico confirmado es incorrecto, no corregirlo sobrescribiendo el registro original; el mecanismo de corrección auditable se debe acordar antes de implementarlo.

## Reglas

- La cola sobrevive a recarga, cierre, reinicio y pérdida de red.
- Cada operación tiene un identificador único y payload estable.
- El backend verifica sesión, alcance del técnico, versión, hash/idempotencia y auditoría.
- Conflictos se conservan; no usar última escritura gana.
- Operaciones inciertas o marcadas para revisión no se reenvían automáticamente.
- `CLAIMED` significa intención física durable local; no representa confirmación remota.
- `CONFIRMED` requiere ACK íntegro o lookup con recibo exacto. Un registro legacy sin campos de recibo suficientes queda `unknown`.
- Lookup `not_found`, `unknown`, error, conflicto o recibo distinto mantiene revisión incierta. Repetir `syncOnce`, reconectar o recargar no reenvía ese corte. Registros legacy sin fase durable y registros con `send-started` quedan limitados a lookup después de interrupción o vencimiento del lease.
- Solo `preparing` durable, sin incertidumbre ni revisión manual, prueba que el POST CUT no comenzó. Su lease vencido vuelve a `pending` sin cambiar reclamación física, orden, versión, operación ni autorización. Permite retomar la misma evidencia y enviar CUT una vez verificada; los fallos previos al envío no generan `PHYSICAL_UNKNOWN`. No se renueva ni reemplaza autorización: el backend decide su vigencia al aceptar CUT.
- Las transiciones físicas locales son append-only y se escriben en la misma transacción IndexedDB que operación, orden y cola. El upgrade crea el almacén de transiciones sin inferir historia legacy.
- `orderVersion` enviado y recibido es la versión esperada fijada por la autorización de esa captura; las versiones before/after del historial describen CAS locales y no reemplazan esa versión autoritativa. Una visita sincronizada no incrementa la versión ni bloquea solicitar autorización del corte; `CLAIMED`, `PHYSICAL_UNKNOWN` y `CONFIRMED` impiden otra ejecución para esa orden.
- Ninguna operación se elimina solo por un fallo de red.

## Revisión humana ADMIN

El piloto provisional expone `POST /v1/sync/operations/{operation_id}/review`. Requiere `order_id`, `technician_id`, `device_id`, `expected_version` y un `reason` no vacío (máximo 1000 caracteres). El servidor comprueba rol ADMIN, asignación, identidad y versión bajo transacción. Si el lookup remoto no confirma la operación (por ejemplo, `not_found`), la revisión cambia el estado físico de la orden a `PHYSICAL_UNKNOWN` y aumenta su versión de `expected_version` a `expected_version + 1`; conserva el estado de negocio de la orden y agrega `HUMAN_REVIEW_RECORDED` con actor, dispositivo, fecha del servidor, motivo y transición.

Registrar una revisión no confirma el corte, no autoriza otra ejecución y no permite reenviar el POST. Solo un recibo remoto íntegro puede confirmar. Para request/response exactos y errores ver [contrato piloto](../api/pilot-contract.md). Esta ruta es `PILOT_PROVISIONAL`, no API oficial de SEPSA; política de conciliación oficial queda `TODO: VALIDAR CON SEPSA`.

## Componentes involucrados

`LocalRepository`, `SyncEngine`, `SyncTransport`, IndexedDB, `HttpPilotClient` y endpoints provisionales del backend.

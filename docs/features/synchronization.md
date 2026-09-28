# Sincronización

## Objetivo

Enviar operaciones locales sin perderlas, duplicarlas ni convertir un resultado incierto en éxito.

## Flujo

1. Validar la acción localmente.
2. Guardar entidad, registro y `operationId` de forma atómica en IndexedDB.
3. Mostrar “guardado en dispositivo” si aún no hay confirmación remota.
4. Enviar cuando la conectividad sea utilizable.
5. Marcar `synced` solo con confirmación válida.
6. Reintentar fallos seguros; consultar estado antes de repetir un resultado incierto.

## Estados

`pending`, `syncing`, `synced` y `failed`. Cada elemento conserva intentos, error, operación, orden y si requiere revisión manual.

## Reglas

- La cola sobrevive a recarga, cierre, reinicio y pérdida de red.
- Cada operación tiene un identificador único y payload estable.
- El backend verifica sesión, alcance del técnico, versión, hash/idempotencia y auditoría.
- Conflictos se conservan; no usar última escritura gana.
- Operaciones inciertas o marcadas para revisión no se reenvían automáticamente.
- Ninguna operación se elimina solo por un fallo de red.

## Componentes involucrados

`LocalRepository`, `SyncEngine`, `SyncTransport`, IndexedDB, `HttpPilotClient` y endpoints provisionales del backend.

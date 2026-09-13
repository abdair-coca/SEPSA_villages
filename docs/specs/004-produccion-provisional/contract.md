# Contrato REST provisional `v1`

Estado: `PILOT_PROVISIONAL`, no es contrato oficial SEPSA.

## Convenciones

- Base URL: `/v1`.
- JSON UTF-8.
- Autenticación: `Authorization: Bearer <session_token>`.
- Cada comando mutante requiere `operation_id` único.
- Errores: `{ "code": string, "message": string }`.
- El servidor es autoridad para rol, asignación, versión y estado.

## Identidad

### `POST /v1/auth/login`

Request:

```json
{ "username": "...", "password": "..." }
```

Response `200`:

```json
{
  "session_token": "...",
  "session_id": "...",
  "expires_at": "...",
  "user": { "user_id": "...", "username": "...", "role": "ADMIN" }
}
```

### `POST /v1/auth/logout`

Revoca sesión actual. Response `204`.

## Administración

### `GET /v1/debtors?query=<text>`

Requiere `ADMIN`. Devuelve registros operativos provisionales.

### `GET /v1/orders`

Requiere `ADMIN`. Devuelve órdenes y estados autoritativos.

### `POST /v1/orders`

Requiere `ADMIN`.

Request:

```json
{ "operation_id": "...", "debtor_id": "...", "purpose": "CUT" }
```

### `POST /v1/orders/{order_id}/assignment`

Requiere `ADMIN`.

Request:

```json
{ "operation_id": "...", "technician_id": "...", "expected_version": 1 }
```

## Técnico

### `GET /v1/technician/orders?device_id=<id>`

Requiere `TECHNICIAN`. Devuelve únicamente órdenes asignadas al usuario y paquete firmado provisionalmente para dispositivo.

### `POST /v1/authorizations/cut`

Requiere `TECHNICIAN`, conexión online y orden elegible. Crea reserva one-use ligada a operación, orden, técnico, dispositivo y versión.

La reserva no confirma el corte. El consumo ocurre únicamente dentro de la transacción de sincronización posterior.

Request:

```json
{
  "operation_id": "...",
  "order_id": "...",
  "device_id": "...",
  "order_version": 2
}
```

### `POST /v1/sync/operations`

Requiere `TECHNICIAN`. Recibe visita, bloqueo o resultado físico. El servidor valida identidad, reserva, versión, estado y asignación dentro de una transacción.

Request: operación de dominio serializada con `operation_id`.

Para `CUT`, el payload debe incluir `order_version`, `authorization_id`, `authorization_token`, `field_capture` y `evidence_refs` o `exception_reason`. El servidor valida captura, asignación, versión y reserva antes de marcar orden `EJECUTADO`.

Limitación explícita del piloto: `evidence_refs` son referencias declarativas. Este contrato todavía no define carga, almacenamiento ni verificación criptográfica de archivos fotográficos; no habilita operación productiva con datos reales.

Responses:

- `200 { "status": "acknowledged", "operation_id": "..." }`
- `409 { "code": "CONFLICT", "message": "...", "operation_id": "..." }`

### `GET /v1/sync/operations/{operation_id}`

Requiere `TECHNICIAN`. Devuelve `confirmed`, `not_found` o `unknown` para recuperación de respuestas perdidas.

## Auditoría

### `GET /v1/audit?order_id=<id>`

Requiere `ADMIN`. Devuelve actor, acción, resultado, timestamps, dispositivo, operación y transición sin permitir edición.

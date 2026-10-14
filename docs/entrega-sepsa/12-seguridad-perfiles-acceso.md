# 12. Seguridad, perfiles de acceso y matriz de permisos

Fuente: `backend/src/http/router.ts`, controladores y servicios de `backend/src/`, y `field-app/src/adapters/browser/session-persistence.ts`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe lo que el piloto implementa hoy. No es una certificación de seguridad.

## 1. Medidas implementadas

- **Sesión en cookie `HttpOnly`:** el secreto no viaja en el JSON ni se guarda en el navegador. `SameSite=Lax`; `Secure` en producción. Duración de 7 días, revocable y vencible: las sesiones vencidas, revocadas o de cuentas deshabilitadas no autentican.
- **Tokens y contraseñas:** la base guarda solo la huella de los tokens y un hash scrypt de las contraseñas.
- **Límite de intentos de acceso:** 5 intentos por 60 s, por dirección y usuario. No confía en `X-Forwarded-For`.
- **Sin pista de existencia:** si el usuario no existe o está deshabilitado, el servidor verifica igualmente la contraseña contra un hash ficticio, para que el tiempo de respuesta no revele qué cuentas existen.
- **Origen de las escrituras:** CORS solo para el origen configurado; POST con cookie exige ese origen y rechaza `cross-site`.
- **Cabeceras y límites:** cabeceras de protección en todas las respuestas, `Cache-Control: no-store` y límite del cuerpo.
- **Autorización de un solo uso:** cada autorización de corte o reconexión queda ligada a operación, orden, técnico, dispositivo y versión.
- **Evidencia verificada:** el servidor recalcula la huella SHA-256 de cada foto.
- **Revisión humana sin confirmación automática:** exige rol ADMIN, versión y motivo; no confirma el corte ni reenvía.
- **Navegador sin token:** la app guarda la identidad de la sesión, nunca el token; recuerda el usuario, nunca la contraseña.
- **Registros sin datos personales:** solo eventos, resultados, códigos e identificadores de petición.

## 2. Matriz de permisos

Sin sesión válida la respuesta es `401`. Con sesión y rol distinto, `403`. Algunas rutas de técnico también verifican que el técnico de la petición sea el de la sesión.

| # | Método y ruta | Acceso | Rol requerido |
|---|---|---|---|
| 1 | `GET /healthz` | Pública | Ninguno |
| 2 | `POST /v1/auth/login` | Pública | Ninguno; exige credenciales |
| 3 | `POST /v1/auth/logout` | Pública | Revoca la sesión |
| 4 | `GET /v1/auth/session` | Sesión | Cualquier rol activo |
| 5 | `POST /v1/auth/role` | Sesión | Solo entre roles concedidos |
| 6 | `GET /v1/technicians` | Sesión | ADMIN |
| 7 | `GET /v1/debtors` | Sesión | ADMIN |
| 8 | `GET /v1/orders` | Sesión | ADMIN |
| 9 | `POST /v1/orders` | Sesión | ADMIN |
| 10 | `POST /v1/orders/batch` | Sesión | ADMIN |
| 11 | `POST /v1/orders/{order_id}/assignment` | Sesión | ADMIN |
| 12 | `GET /v1/technician/orders` | Sesión | TECHNICIAN |
| 13 | `POST /v1/authorizations/cut` | Sesión | TECHNICIAN |
| 14 | `POST /v1/authorizations/cut/consume` | Sesión | TECHNICIAN, con alcance propio |
| 15 | `GET /v1/authorizations/cut/{operation_id}` | Sesión | TECHNICIAN; sin token en la respuesta |
| 16 | `POST /v1/authorizations/reconnection` | Sesión | TECHNICIAN |
| 17 | `POST /v1/authorizations/reconnection/consume` | Sesión | TECHNICIAN, con alcance propio |
| 18 | `GET /v1/authorizations/reconnection/{operation_id}` | Sesión | TECHNICIAN; sin token |
| 19 | `POST /v1/evidence/assets` | Sesión | TECHNICIAN, con alcance propio |
| 20 | `POST /v1/sync/operations` | Sesión | TECHNICIAN, con alcance propio |
| 21 | `POST /v1/sync/operations/{operation_id}/review` | Sesión | ADMIN |
| 22 | `GET /v1/sync/operations/{operation_id}` | Sesión | TECHNICIAN (solo las suyas) o ADMIN |
| 23 | `GET /v1/audit` | Sesión | ADMIN |
| 24 | `GET /v1/admin/reconciliation` | Sesión | ADMIN, solo lectura |

## 3. Perfiles

- **ADMIN:** gestiona órdenes, consulta técnicos, auditoría y conciliación en solo lectura, y revisa operaciones inciertas. No consume autorizaciones ni ejecuta acciones de campo.
- **TECHNICIAN:** descarga su paquete, pide y consume autorizaciones, sube fotos, envía operaciones y consulta solo sus operaciones. Una operación o autorización ajena responde `not_found`.
- **Roles concedidos:** una cuenta solo cambia de rol si tiene concedidos ambos. Cada petición verifica que el rol activo sigue concedido, y el cambio se audita.

## 4. Pendientes y limitaciones

Pendientes de confirmación por SEPSA (lista de pendientes, apartado 6.1): proveedor, topología, TLS y rotación de secretos; límite de intentos compartido entre réplicas; sesiones y revocación por dispositivo; copias de seguridad cifradas y pruebas de restauración; y proveedor de métricas y alertas.

Limitaciones del piloto: no es la API oficial de SEPSA y sus permisos pueden cambiar con la integración. El límite de intentos se reinicia con el proceso. Cuenta por la dirección del socket y no lee `X-Forwarded-For`: detrás de un proxy ve una sola dirección, así que quien conozca un usuario podría bloquearlo 60 s (verificar en producción). La sesión dura 7 días desde el acceso y no caduca por inactividad. Los permisos por rol y por orden asignada los cubre `backend/test/permissions.integration.test.ts`; los resultados están en la apartado 4.2.

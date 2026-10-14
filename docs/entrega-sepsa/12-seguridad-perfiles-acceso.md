# 12. Seguridad, perfiles de acceso y matriz de permisos

Fuente: `backend/src/http/router.ts`, controladores y servicios de `backend/src/`, y `field-app/src/adapters/browser/session-persistence.ts`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe lo que el piloto implementa hoy. No es una certificación de seguridad. Matriz completa de 24 rutas en el anexo A12.

## 1. Medidas implementadas

- **Sesión:** cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción; el secreto nunca viaja en el JSON ni se guarda en el navegador. Dura 7 días y es revocable; las sesiones vencidas, revocadas o de cuentas deshabilitadas no autentican.
- **Credenciales:** la base guarda solo la huella de los tokens y un hash scrypt de las contraseñas.
- **Intentos de acceso:** 5 por 60 s, por dirección y usuario. Si el usuario no existe, se verifica igualmente la contraseña contra un hash ficticio, para no revelar qué cuentas existen.
- **Origen:** CORS solo para el origen configurado; POST con cookie exige ese origen y rechaza `cross-site`.
- **Autorizaciones:** de un solo uso, ligadas a operación, orden, técnico, dispositivo y versión.
- **Evidencia:** el servidor recalcula la huella SHA-256 de cada foto.
- **Revisión humana:** exige rol ADMIN, versión y motivo; no confirma el corte ni reenvía.
- **Navegador:** guarda la identidad de la sesión y el usuario recordado, nunca el token ni la contraseña. Los registros no contienen datos personales.

## 2. Perfiles y permisos

Sin sesión válida la respuesta es `401`; con sesión y rol distinto, `403`.

- **ADMIN:** gestiona órdenes, técnicos, auditoría y conciliación en solo lectura, y revisa operaciones inciertas. No consume autorizaciones ni ejecuta acciones de campo.
- **TECHNICIAN:** descarga su paquete, pide y consume autorizaciones, sube fotos, envía operaciones y consulta solo sus operaciones. Lo ajeno responde `not_found`.
- **Roles concedidos:** una cuenta cambia de rol solo si tiene concedidos ambos; cada petición verifica el rol activo y el cambio se audita.

El piloto tiene 24 rutas: 3 públicas (`/healthz`, login y logout) y 21 con sesión. La matriz completa, ruta por ruta, está en el anexo.

## 3. Pendientes y limitaciones

Pendientes de confirmación por SEPSA: proveedor, topología, TLS y rotación de secretos; límite de intentos compartido entre réplicas; sesiones y revocación por dispositivo; copias cifradas y pruebas de restauración; y métricas y alertas.

Limitaciones: el piloto no es la API oficial de SEPSA. El límite de intentos se reinicia con el proceso y cuenta por la dirección del socket; detrás de un proxy, quien conozca un usuario podría bloquearlo 60 s (verificar en producción). La sesión no caduca por inactividad. Los permisos por rol y por orden asignada los cubre `backend/test/permissions.integration.test.ts`.

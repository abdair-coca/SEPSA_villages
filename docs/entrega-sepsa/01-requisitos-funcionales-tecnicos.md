# 01. Requisitos funcionales y técnicos

Fuente: código de `backend/` y `field-app/`; respuestas del equipo del 2026-10-13.
Fecha: 2026-10-13
Estado: entrega, copia fechada.

**Implementado** significa que existe en el código y tiene pruebas, no que esté validado en campo ni aprobado por SEPSA. Los puntos que dependen de SEPSA están en la lista de pendientes.

## Requisitos funcionales

| ID | Requisito | Estado |
|---|---|---|
| RF-01 | Acceso con roles `ADMIN` y `TECHNICIAN`. Cambio de rol solo entre los roles concedidos. | Implementado |
| RF-02 | El técnico ve y opera solo sus órdenes asignadas. El servidor valida el permiso. | Implementado |
| RF-03 | El administrador busca morosos con filtros y ve deuda y si ya existe una orden activa. | Implementado |
| RF-04 | Crear una orden y asignar técnico; también en lote, con vista previa y confirmación. | Implementado (la individual es la prioritaria) |
| RF-05 | No hay dos órdenes activas para el mismo suministro y propósito. | Implementado |
| RF-06 | La asignación usa la versión esperada; un conflicto no sobrescribe. | Implementado |
| RF-07 | Anular una orden. | Pendiente: el piloto no tiene esta operación |
| RF-08 | Cada acción guarda actor, fecha, versión y resultado en auditoría. | Implementado |
| RF-09 | Errores y conflictos se guardan para revisión; nunca se repite una creación automáticamente. | Implementado |
| RF-10 | La consulta de auditoría es solo del administrador. | Implementado |
| RF-11 | El técnico descarga sus órdenes y las consulta sin conexión (cliente, dirección, suministro, medidor, deuda y Kardex). | Implementado |
| RF-12 | El técnico registra una visita sin afirmar que hubo corte. | Implementado |
| RF-13 | El corte solo se ejecuta sobre una orden asignada, en estado `GENERADO` y sin reclamación física previa. | Implementado |
| RF-14 | Captura de corte: lectura final del medidor (kWh, no negativa), GPS y foto. Los tres son obligatorios. | Implementado. La lectura final no admite excepción |
| RF-15 | Si no se capturan GPS o foto, excepción con motivo escrito. | Implementado |
| RF-16 | Foto JPEG o PNG, ligada a la orden y a la operación; la app la reduce a 1 MB como máximo. | Implementado |
| RF-17 | Autorización de corte en línea justo antes de cortar: concluyente, vigente, de un solo uso y ligada a orden, técnico, dispositivo, operación y versión. | Implementado |
| RF-18 | Sin autorización concluyente no hay corte. Rechazo o sesión no válida: visita bloqueada. Error del servidor, timeout o repetición: resultado incierto para revisión. | Implementado |
| RF-19 | Si el consumo de la autorización queda incierto, se reintenta con el mismo identificador (esperas de 1 s y 3 s). Nunca se pide una autorización nueva sola. | Implementado |
| RF-20 | Si la consulta de una autorización no es concluyente, el técnico la reintenta con el mismo identificador. Mientras no lo sea, no hay corte ni reconexión, y la acción física no se repite. | Implementado (botón «Verificar con servidor») |
| RF-21 | Antes de mostrar éxito, la intención, la operación y la cola se guardan en el dispositivo en una sola transacción. | Implementado |
| RF-22 | Estados físicos: `NONE`, `CLAIMED`, `CONFIRMED` y `PHYSICAL_UNKNOWN`. Un incierto requiere verificación y no se repite. | Implementado |
| RF-23 | Revisión humana de un resultado incierto, con motivo y versión. | Parcial: existe como API, sin pantalla |
| RF-24 | El administrador ve en solo lectura las operaciones por conciliar. | Implementado |
| RF-25 | La reconexión solo se registra sobre un corte confirmado; el ciclo comparte la misma orden. | Implementado |
| RF-26 | Antes de confirmar la reconexión se reserva una habilitación de un solo uso ligada a orden, técnico, dispositivo, operación y versión. Al sincronizar, la orden pasa a `RECONEXIÓN`. | Implementado |
| RF-27 | Una reconexión no confirmada se verifica solo consultando su habilitación con el mismo identificador. La cola no la reintenta. | Implementado |
| RF-28 | Si la consulta demuestra que la autorización no se usó (`expired`, `rejected` o `not_found`), el técnico pide una nueva. El administrador no interviene. | Implementado |
| RF-29 | Elegibilidad, cargos y prioridad de reconexión: los decide el administrador. El sistema no los valida. | Fuera del sistema |
| RF-30 | La cola local guarda cada operación con identificador único y estado (`pending`, `syncing`, `synced`, `failed`). Sale de la cola solo con confirmación válida del servidor. | Implementado |
| RF-31 | La cola sobrevive a recarga, cierre de la app y pérdida de red. | Implementado |
| RF-32 | Antes de enviar un corte, la foto se sube y se verifica; el servidor acepta el corte solo si la foto está verificada y ligada a la operación. | Implementado |
| RF-33 | Si la respuesta se pierde, la operación queda `PHYSICAL_UNKNOWN`; se consulta con el mismo identificador y nunca se reenvía el envío original. | Implementado |
| RF-34 | Las transiciones físicas se guardan en la misma transacción que la operación; no se borran ni sobrescriben. | Implementado |
| RF-35 | Los errores dicen qué quedó guardado y cuál es el siguiente paso. | Implementado |
| RF-36 | Los datos sincronizados del técnico deben poder consultarse desde otro dispositivo. | Parcial: el registro (cortes, visitas y fotos) se consulta desde el servidor y se probó en navegador con un dispositivo nuevo; falta la prueba con dos dispositivos físicos. `TODO: VALIDAR CON SEPSA` |

## Requisitos técnicos y no funcionales

| ID | Requisito | Estado |
|---|---|---|
| RT-01 | Interfaz en React, TypeScript y Vite; PWA con datos locales en IndexedDB y Service Worker. | Implementado |
| RT-02 | Servidor en Node.js con TypeScript y PostgreSQL 16 (`pg`). | Implementado |
| RT-03 | Esquema por migraciones SQL; las migraciones históricas no se modifican. | Implementado |
| RT-04 | Capas: controladores, servicios, repositorios y base. Un controlador no ejecuta SQL. | Implementado |
| RT-05 | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción. El secreto de sesión no sale en el JSON ni en el navegador. | Implementado |
| RT-06 | CORS solo para el origen configurado; POST con cookie exige ese origen y rechaza `cross-site`. | Implementado |
| RT-07 | Límite de intentos de acceso: 5 por 60 s, por dirección y usuario, en memoria de un proceso. | Implementado (límite compartido: SEPSA) |
| RT-08 | Contraseñas y tokens con scrypt o huella; nunca en texto plano. | Implementado |
| RT-09 | Los registros no contienen contraseñas, tokens, cookies, fotos ni datos personales. | Implementado |
| RT-10 | Idempotencia por identificador de operación: reenvío idéntico, mismo recibo; contenido distinto, conflicto `409`. | Implementado |
| RT-11 | El servidor recalcula la huella SHA-256 de cada foto. Límite del cuerpo HTTP: 2 MB en el despliegue. | Implementado |
| RT-12 | Las fotos se guardan en PostgreSQL de forma permanente. El código no borra evidencias. | Implementado |
| RT-13 | Los importes van en centavos enteros. | Implementado |
| RT-14 | Sin secretos en el frontend ni en la documentación. | Implementado |
| RT-15 | Cada cambio de comportamiento, permiso, persistencia o sincronización tiene pruebas. | Implementado |
| RT-16 | El modo simulado solo existe en desarrollo o con una variable explícita; el despliegue no lo incluye. | Implementado |
| RT-17 | Proveedor de nube, topología, TLS, rotación de secretos, sesiones por dispositivo y copias de seguridad. | Pendiente de SEPSA. `TODO: VALIDAR CON SEPSA` |

# 01. Requisitos funcionales y técnicos

Fuente: código de `backend/` y `field-app/`; respuestas del equipo del 2026-10-13.
Fecha: 2026-10-13
Estado: entrega, copia fechada.

**Implementado**: existe en el código y tiene pruebas; no significa validado en campo ni aprobado por SEPSA. Lo que depende de SEPSA está en la lista de pendientes.

## Requisitos funcionales

| ID | Requisito | Estado |
|---|---|---|
| RF-01 | Acceso con roles `ADMIN` y `TECHNICIAN`; cambio de rol solo entre los concedidos. | Implementado |
| RF-02 | El técnico ve y opera solo sus órdenes asignadas; el servidor valida el permiso. | Implementado |
| RF-03 | Búsqueda de morosos con filtros; muestra deuda y si ya hay una orden activa. | Implementado |
| RF-04 | Crear orden y asignar técnico, individual (prioritaria) o en lote, con vista previa y confirmación. | Implementado |
| RF-05 | No hay dos órdenes activas para el mismo suministro y propósito. | Implementado |
| RF-06 | La asignación usa la versión esperada; un conflicto no sobrescribe. | Implementado |
| RF-07 | Anular una orden. | Pendiente: el piloto no tiene esta operación |
| RF-08 | Cada acción guarda actor, fecha, versión y resultado en auditoría. | Implementado |
| RF-09 | Errores y conflictos se guardan para revisión; una creación nunca se repite automáticamente. | Implementado |
| RF-10 | La consulta de auditoría es solo del administrador. | Implementado |
| RF-11 | El técnico descarga sus órdenes y las consulta sin conexión (cliente, dirección, suministro, medidor, deuda y Kardex). | Implementado |
| RF-12 | El técnico registra una visita sin afirmar que hubo corte. | Implementado |
| RF-13 | El corte solo se ejecuta sobre una orden asignada, en `GENERADO` y sin reclamación física previa. | Implementado |
| RF-14 | Captura de corte: lectura final del medidor (kWh, no negativa), GPS y foto; los tres son obligatorios. | Implementado. La lectura final no admite excepción |
| RF-15 | Sin GPS o sin foto, excepción con motivo escrito. | Implementado |
| RF-16 | Foto JPEG o PNG ligada a la orden y a la operación; la app la reduce a 1 MB como máximo. | Implementado |
| RF-17 | Autorización de corte en línea justo antes de cortar: concluyente, vigente, de un solo uso y ligada a orden, técnico, dispositivo, operación y versión. | Implementado |
| RF-18 | Sin autorización concluyente no hay corte. Rechazo o sesión no válida: visita bloqueada. Error del servidor, timeout o repetición: resultado incierto para revisión. | Implementado |
| RF-19 | Consumo incierto: reintento con el mismo identificador (esperas de 1 s y 3 s). Nunca se pide una autorización nueva sola. | Implementado |
| RF-20 | Consulta no concluyente: reintento con el mismo identificador. Sin corte ni reconexión mientras no lo sea; la acción física no se repite. | Implementado (botón «Verificar con servidor») |
| RF-21 | Intención, operación y cola se guardan en el dispositivo en una sola transacción antes de mostrar éxito. | Implementado |
| RF-22 | Estados físicos `NONE`, `CLAIMED`, `CONFIRMED` y `PHYSICAL_UNKNOWN`. Un incierto requiere verificación y no se repite. | Implementado |
| RF-23 | Revisión humana de un resultado incierto, con motivo y versión. | Parcial: existe como API, sin pantalla |
| RF-24 | El administrador ve en solo lectura las operaciones por conciliar. | Implementado |
| RF-25 | La reconexión solo se registra sobre un corte confirmado; el ciclo comparte la orden. | Implementado |
| RF-26 | Antes de confirmar se reserva una habilitación de un solo uso ligada a orden, técnico, dispositivo, operación y versión. Al sincronizar, la orden pasa a `RECONEXIÓN`. | Implementado |
| RF-27 | Una reconexión no confirmada se verifica solo consultando su habilitación con el mismo identificador; la cola no la reintenta. | Implementado |
| RF-28 | Si la habilitación no se usó (`expired`, `rejected` o `not_found`), el técnico pide una nueva; el administrador no interviene. | Implementado |
| RF-29 | Elegibilidad, cargos y prioridad de reconexión: los decide el administrador; el sistema no los valida. | Fuera del sistema |
| RF-30 | Cola local con identificador único y estado (`pending`, `syncing`, `synced`, `failed`); sale solo con confirmación válida del servidor. | Implementado |
| RF-31 | La cola sobrevive a recarga, cierre de la app y pérdida de red. | Implementado |
| RF-32 | La foto se sube y se verifica antes de enviar el corte; el servidor acepta el corte solo con la foto verificada y ligada a la operación. | Implementado |
| RF-33 | Si la respuesta se pierde, la operación queda `PHYSICAL_UNKNOWN`; se consulta con el mismo identificador y nunca se reenvía el envío original. | Implementado |
| RF-34 | Las transiciones físicas se guardan en la misma transacción que la operación; no se borran ni sobrescriben. | Implementado |
| RF-35 | Los errores dicen qué quedó guardado y cuál es el siguiente paso. | Implementado |
| RF-36 | Los datos sincronizados del técnico deben poder consultarse desde otro dispositivo. | Implementado: el técnico consulta desde el servidor su registro (operaciones, captura y fotos), sin depender del almacenamiento del dispositivo. Probado con pruebas de integración, en navegador con un dispositivo nuevo y verificado a mano en dos dispositivos físicos y en vista móvil. `TODO: VALIDAR CON SEPSA` |

## Requisitos técnicos y no funcionales

| ID | Requisito | Estado |
|---|---|---|
| RT-01 | Interfaz en React, TypeScript y Vite; PWA con datos locales en IndexedDB y Service Worker. | Implementado |
| RT-02 | Servidor en Node.js con TypeScript y PostgreSQL 16 (`pg`). | Implementado |
| RT-03 | Esquema por migraciones SQL; las migraciones históricas no se modifican. | Implementado |
| RT-04 | Capas: controladores, servicios, repositorios y base. Un controlador no ejecuta SQL. | Implementado |
| RT-05 | Cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción. El secreto de sesión no sale en el JSON ni en el navegador. | Implementado |
| RT-06 | CORS solo para el origen configurado; un POST con cookie exige ese origen y rechaza `cross-site`. | Implementado |
| RT-07 | Límite de intentos de acceso: 5 por 60 s, por dirección y usuario, en memoria de un proceso. | Implementado (límite compartido: SEPSA) |
| RT-08 | Contraseñas y tokens con scrypt o huella; nunca en texto plano. | Implementado |
| RT-09 | Los registros no contienen contraseñas, tokens, cookies, fotos ni datos personales. | Implementado |
| RT-10 | Idempotencia por identificador de operación: reenvío idéntico, mismo recibo; contenido distinto, conflicto `409`. | Implementado |
| RT-11 | El servidor recalcula la huella SHA-256 de cada foto. Límite del cuerpo HTTP: 2 MB en el despliegue. | Implementado |
| RT-12 | Las fotos se guardan en PostgreSQL de forma permanente; el código no borra evidencias. | Implementado |
| RT-13 | Los importes van en centavos enteros. | Implementado |
| RT-14 | Sin secretos en el frontend ni en la documentación. | Implementado |
| RT-15 | Cada cambio de comportamiento, permiso, persistencia o sincronización tiene pruebas. | Implementado |
| RT-16 | El modo simulado solo existe en desarrollo o con una variable explícita; el despliegue no lo incluye. | Implementado |
| RT-17 | Proveedor de nube, topología, TLS, rotación de secretos, sesiones por dispositivo y copias de seguridad. | Pendiente de SEPSA. `TODO: VALIDAR CON SEPSA` |

# 02. Procesos de corte y reconexión

Fuente: código de `field-app/` y `backend/`; tabla SC08 recibida de SEPSA (imagen del 2026-10-03); respuestas del equipo del 2026-10-13.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Detalle con requisitos y resultados de autorización en el anexo A02.

## 1. Corte

1. **Administrador:** busca el suministro, crea la orden (o consulta la activa) y asigna técnico.
2. **Técnico:** descarga sus órdenes y trabaja sin conexión.
3. **Técnico:** captura lectura final, GPS y foto. Sin GPS o foto, registra la excepción con motivo.
4. **Técnico:** pide la autorización en línea justo antes de cortar.
5. **App:** con autorización concluyente, guarda intención, operación y cola en una transacción y solo después muestra «guardado en el dispositivo».
6. **Técnico:** confirma el corte; la app consume la autorización y reintenta con el mismo identificador si el consumo queda incierto.
7. **App:** sube y verifica la foto; el servidor acepta el corte solo con la foto verificada y ligada.
8. **App y servidor:** con confirmación válida la operación queda `synced`. Si la respuesta se pierde, queda `PHYSICAL_UNKNOWN` y se consulta, sin reenviar.
9. **Administrador:** ve en solo lectura las operaciones por conciliar.

La autorización solo permite cortar si es concluyente. Un rechazo o una sesión no válida bloquean la visita; un error, un timeout o una operación repetida dejan el resultado incierto para revisión. Ninguno de estos casos corta. Si la autorización no se usó (`expired`, `rejected` o `not_found`), el técnico pide una nueva; el administrador no interviene.

## 2. Reconexión

La reconexión solo se registra sobre un corte confirmado. El técnico confirma, la app pide una habilitación de un solo uso ligada a la orden, el técnico, el dispositivo, la operación y la versión, y al sincronizar la orden pasa a `RECONEXIÓN`. Si no queda confirmada, se verifica con «Verificar con servidor»; la cola no la reintenta.

## 3. Estados

- **Orden:** `GENERADO` → `EJECUTADO` → `RECONEXIÓN`. `ANULADO` existe en el modelo, pero el piloto no anula.
- **Estado físico:** `NONE`, `CLAIMED`, `CONFIRMED`, `PHYSICAL_UNKNOWN`.
- **Cola de envío:** `pending`, `syncing`, `synced`, `failed`.

## 4. Registro SC08

La tabla SC08 oficial tiene 21 campos. El sistema no genera hoy un archivo SC08; su destino lo define SEPSA. `TODO: VALIDAR CON SEPSA`

- **Datos de la carga de morosos:** NRO_CUENTA, CONSUMIDOR, DIRECCIÓN, TELEFONO y LOCALIDAD.
- **Momento y técnico del evento:** FECHA_CORTE, HORA_CORTE, TEC_CORTE y TEC_REPOS. Implementados o en verificación.
- **Asignados por SEPSA:** NRO_CORREL y NIV_CALIDAD. La app los recibe tal cual; no existen hoy en el modelo.
- **CATEGORÍA:** asociada a `tariff`, confirmado el 2026-10-13.
- **Fuera de alcance del piloto (9 campos):** FECHA_PAGO, HORA_PAGO, FECHA_REPO, HORA_REPO, TIEMPO, DEMORA, ENER_PROM, POT_FACT e IMP_REDUC.

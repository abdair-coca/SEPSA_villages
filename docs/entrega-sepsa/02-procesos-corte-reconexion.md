# 02. Procesos de corte y reconexión

Fuente: código de `field-app/` y `backend/`; tabla SC08 recibida de SEPSA (imagen del 2026-10-03); respuestas del equipo del 2026-10-13.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Los números RF-xx remiten a los requisitos funcionales.

## 1. Corte

1. **Administrador:** busca el suministro, crea la orden (o consulta la activa) y asigna técnico. RF-03 a RF-06.
2. **Técnico:** descarga sus órdenes y las consulta sin conexión. RF-11.
3. **Técnico:** captura la lectura final, el GPS y la foto. Si no hay GPS o foto, registra la excepción con motivo. RF-14 a RF-16.
4. **Técnico:** pide la autorización en línea justo antes de cortar. RF-17.
5. **App:** si la autorización es concluyente, guarda la intención, la operación y la cola en una sola transacción. Solo después muestra «guardado en el dispositivo». RF-21.
6. **Técnico:** confirma el corte. La app consume la autorización; si el consumo queda incierto, lo reintenta con el mismo identificador. RF-19.
7. **App:** sube la foto y verifica que llegó; después envía el corte. El servidor lo acepta solo con la foto verificada y ligada a la operación. RF-30 a RF-32.
8. **App y servidor:** con confirmación válida, la operación queda `synced`. Si la respuesta se pierde, queda `PHYSICAL_UNKNOWN` y se consulta con el mismo identificador. RF-33.
9. **Administrador:** ve en solo lectura las operaciones por conciliar. RF-24.

**Resultado de la autorización:**

| Respuesta del servidor | Efecto |
|---|---|
| Concluyente, vigente y de un solo uso | Se puede cortar |
| Rechazo explícito (orden no encontrada, no asignada, versión en conflicto, no elegible) o sesión no válida | Visita bloqueada, con el código. No corta |
| Error del servidor, timeout, operación repetida o conflicto de identificador | Resultado incierto para revisión. No corta |
| Consulta no concluyente | El técnico la reintenta con el mismo identificador. No corta hasta que sea concluyente |

Si la consulta demuestra que la autorización no se usó (`expired`, `rejected` o `not_found`), el técnico pide una nueva después de confirmarlo. La app cierra la operación anterior fuera de la cola y registra una visita de constancia. Un corte cuyo envío ya empezó no se cierra así. El administrador no interviene.

## 2. Reconexión

1. **App:** verifica que la orden tiene un corte confirmado. RF-25.
2. **Técnico:** confirma la reconexión. La app guarda la hora capturada y el técnico con su nombre histórico, en el dispositivo. RF-25.
3. **App:** pide una habilitación en línea, de un solo uso y ligada a orden, técnico, dispositivo, operación y versión. RF-26.
4. **App:** consume la habilitación con el mismo identificador; si queda incierta, la reintenta como en el corte. RF-19.
5. **App y servidor:** sincroniza. Con confirmación válida, la orden pasa a `RECONEXIÓN`. RF-26.
6. **Técnico:** si la reconexión no está confirmada, usa «Verificar con servidor», que consulta la habilitación. La cola de sincronización no la consulta ni la reintenta. RF-27.
7. Si la habilitación no se usó, el técnico pide una nueva (RF-28). Si la consulta no es concluyente, la reconexión queda incierta y no se envía (RF-20).

## 3. Estados

- **Orden:** `GENERADO` → `EJECUTADO` → `RECONEXIÓN`. `ANULADO` existe en el modelo, pero el piloto no anula.
- **Estado físico:** `NONE`, `CLAIMED`, `CONFIRMED`, `PHYSICAL_UNKNOWN`.
- **Cola de envío:** `pending`, `syncing`, `synced`, `failed`.

## 4. Registro SC08

La tabla SC08 oficial tiene 21 campos. El sistema no genera hoy un archivo SC08; su destino (archivo o API) lo define SEPSA. `TODO: VALIDAR CON SEPSA`

| Campo SC08 | Situación en el piloto |
|---|---|
| NRO_CORREL | Lo asigna SEPSA. La app lo recibe tal cual. No existe hoy en el modelo. `TODO: VALIDAR CON SEPSA` |
| NRO_CUENTA, CONSUMIDOR, DIRECCIÓN, TELEFONO, LOCALIDAD | Datos de la carga de morosos (`account_id`, `customer_name`, `address`, `contact_phone`, `locality`) |
| CATEGORÍA | Asociación provisional con `tariff`. `TODO: VALIDAR CON SEPSA` |
| NIV_CALIDAD | Lo asigna SEPSA. La app lo recibe. No existe hoy en el modelo |
| FECHA_CORTE, HORA_CORTE | Momento del corte, guardado en el dispositivo. Verificar que llegue al servidor |
| TEC_CORTE, TEC_REPOS | Nombre del técnico en la fecha del evento. Implementado |
| FECHA_PAGO, HORA_PAGO, FECHA_REPO, HORA_REPO, TIEMPO, DEMORA, ENER_PROM, POT_FACT, IMP_REDUC | Fuera de alcance del piloto. Responsabilidad de SEPSA |

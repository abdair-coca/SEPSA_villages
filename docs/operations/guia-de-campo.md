# Guía de campo del piloto

Para técnicos que usan SEPSA Campo en el celular, con y sin conexión. Sustituye a `guia-tecnico-campo-piloto.pdf`, que se retiró por estar desactualizado. Las reglas de corte siguen en [RULES.md](../RULES.md).

## Regla principal

**Sin autorización en línea no hay corte.** Si la app no puede confirmar la autorización del servidor, registra una visita y te lo indica. No cortes por tu cuenta.

## 1. Antes de salir (con internet)

1. Conéctate a WiFi o datos.
2. Abre SEPSA Campo desde el icono de la app, no desde un mensaje.
3. Pulsa **Enviar pendientes y actualizar**. Envía lo pendiente y descarga tus órdenes asignadas. Para descargarlas necesitas internet.
4. Revisa que la cabecera diga **Red disponible** y que aparezca tu **Orden actual**.

## 2. En campo (sin internet)

- Puedes abrir tus órdenes y revisar sus datos.
- Puedes registrar una **visita** y tomar fotos. Todo queda guardado en el celular.
- Un corte sin conexión no se autoriza. Al confirmarlo, la app registra una visita y te dice que el corte no quedó autorizado.

## 3. Registrar un corte (con conexión)

1. Abre la orden y pulsa **Registrar corte**.
2. Captura los datos en cada paso y pulsa **Continuar** para avanzar:
   - **Lectura final del medidor (kWh)**: obligatoria. Debe ser un número no negativo.
   - **Tipo de corte**.
   - **GPS**: si no puedes capturar las coordenadas, marca **No puedo capturar coordenadas** y escribe la justificación.
   - **Evidencia**: la foto. Si no puedes adjuntarla, marca **No puedo adjuntar evidencia** y escribe la **Justificación obligatoria**.
3. En el último paso, pulsa **Confirmar corte**. La app guarda el corte en el celular y pide la autorización al servidor.
4. Si aparece **No se pudo confirmar la autorización del corte** o **El servidor no autorizó la acción**, el corte no se hizo y quedó registrada una visita. No repitas el corte: avisa a tu supervisor.

## 4. Registrar una visita

Pulsa **Registrar visita**. Una visita registra tu presencia en el domicilio. No significa que hubo corte.

## 5. Preparar una reconexión

1. Abre una orden con corte confirmado y pulsa **Preparar reconexión**.
2. Si no hubo demora, deja **Sin demora** en el campo de observación. Si hubo, escríbela.
3. Pulsa **Confirmar reconexión**. La app registra la hora de la reposición.
4. Si aparece **Sincronización incierta** o **Reposición bloqueada**, no repitas la reposición. Pulsa **Verificar con servidor**.
5. Si el servidor confirma que la autorización venció, fue rechazada o no existe, la app muestra **Solicitar nueva autorización**. Pídela solo si aparece. La operación anterior queda cerrada con el mensaje «Cerrada: la autorización no se usó. La nueva solicitud queda como otra operación.».

## 6. Qué significan las etiquetas

**Órdenes**

| Etiqueta | Significado |
|---|---|
| Por ejecutar | La orden no tiene corte registrado. |
| Ejecutada | Corte registrado. |
| Reconectada | Reposición confirmada. |
| En revisión | El resultado físico no está claro. No repitas la acción. |
| Anulada | La orden fue anulada. |

**Estado físico**

| Etiqueta | Significado |
|---|---|
| Sin ejecución | No hay acción física registrada. |
| Reclamado | La intención está guardada en el celular, sin confirmación del servidor. |
| Confirmado | El servidor confirmó el resultado. |
| Resultado incierto | No se sabe si la acción ocurrió. No repitas la acción. |

**Cola de envío**

| Etiqueta | Significado |
|---|---|
| Pendiente | Guardada en el celular, esperando envío. |
| Sincronizando | Se está enviando. |
| Sincronizado | El servidor confirmó la operación. |
| Falló | No se envió. Pulsa **Reintentar envío**. Se reenvía la misma operación, sin duplicarla. |
| Revisión humana · no reenviar | El resultado no está claro. No repitas la acción. Avisa a tu supervisor. |

## 7. Si algo falla

- **No veo órdenes.** Necesitas internet una vez. Vuelve a WiFi, abre **Jornada de campo** y pulsa **Enviar pendientes y actualizar**.
- **La sesión venció.** Vuelve a entrar con internet y pulsa **Verificar con servidor** en la operación pendiente. Tus datos pendientes siguen en el celular.
- **Falló un envío.** Pulsa **Reintentar envío**.
- **Revisión humana · no reenviar** o **En revisión.** No repitas la acción física. Avisa a tu supervisor.

## 8. Tus datos y tu sesión

- La sesión dura 7 días. Entrar necesita conexión; con la sesión vigente puedes trabajar sin conexión.
- Desde cualquier celular puedes ver lo que ya se sincronizó de tus órdenes: en la ficha de la orden, pulsa **Ver registro del servidor**. Lo que todavía solo está en este celular aparece en **Pendientes**, no ahí.
- Cerrar sesión no borra las órdenes ni las operaciones pendientes del celular. Por precaución, envía las pendientes antes de cerrar sesión.
- No borres los datos del navegador de SEPSA Campo: ahí están tus órdenes y tus operaciones pendientes.

## 9. Contacto

Supervisor: ______________________  Teléfono: ______________________

Completa estos datos antes de salir a campo.

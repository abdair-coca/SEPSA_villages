# Especificación: Autorización de corte

## Propósito

Impedir cortes improcedentes mediante validación online inmediata del estado de pago, usando una autorización breve que tolere conectividad intermitente.

## Requisitos

### Requisito: Validación online previa

Antes de cada corte, el sistema DEBE (MUST) obtener una respuesta online concluyente de la fuente externa autorizada. El adaptador provisional DEBE (MUST) distinguir como mínimo `authorized`, `payment_detected`, `not_authorized` y `unknown`. NO DEBE (MUST NOT) interpretar `unknown`, falta de respuesta, timeout o error como autorización.

#### Escenario: Autorización concedida

- GIVEN una orden `GENERADO` asignada al técnico
- WHEN la validación online confirma que sigue habilitada para corte
- THEN el sistema permite continuar mientras la autorización permanezca vigente

#### Escenario: Respuesta incierta

- GIVEN una solicitud enviada sin respuesta concluyente
- WHEN vence el intento de validación
- THEN el sistema bloquea el corte y conserva el intento para revalidación

### Requisito: Operación con señal débil

La validación DEBE (MUST) intercambiar únicamente identificadores y versión necesarios para decidir. Para el prototipo, DEBE (MUST) ejecutar como máximo tres intentos de cinco segundos, separados por esperas de uno y dos segundos. Estos valores son una política técnica provisional y quedan como `TODO: VALIDAR CON SEPSA`. Los reintentos NO DEBEN (MUST NOT) autorizar por sí mismos ni bloquear otras consultas locales.

#### Escenario: Conectividad intermitente

- GIVEN señal insuficiente durante el primer intento
- WHEN un reintento obtiene respuesta concluyente
- THEN el sistema aplica esa respuesta una sola vez

#### Escenario: Sin conectividad útil

- GIVEN se alcanza el límite configurado sin respuesta concluyente
- WHEN el técnico intenta continuar
- THEN el sistema no permite cortar y registra la visita pendiente

### Requisito: Autorización única y breve

Cada autorización DEBE (MUST) ser verificable, de un solo uso y estar ligada a orden, técnico, dispositivo, operación y versión. Su consumo remoto DEBE (MUST) reclamar una única ejecución. El prototipo usa reloj del emisor y vigencia provisional de cinco minutos; `now >= expires_at` significa vencida. `TODO: VALIDAR CON SEPSA`.

#### Escenario: Autorización vencida

- GIVEN una autorización fuera de vigencia
- WHEN el técnico intenta ejecutar el corte
- THEN el sistema bloquea la acción y exige nueva validación online

#### Escenario: Reutilización

- GIVEN una autorización ya consumida
- WHEN se intenta usar nuevamente
- THEN el sistema rechaza la segunda ejecución

### Requisito: Pago concurrente prevalente

La fuente externa DEBE (MUST) serializar atómicamente el pago y el consumo de autorización. Si el pago se confirma primero, DEBE (MUST) prevalecer y anular la orden. Si la autorización se consume primero, la ejecución queda reclamada y ninguna segunda autorización puede consumirse. El técnico DEBE (MUST) consumirla online inmediatamente antes de iniciar la acción física.

#### Escenario: Pago detectado

- GIVEN una orden todavía no ejecutada
- WHEN la validación informa un pago parcial o total
- THEN el sistema bloquea el corte y transiciona la orden a `ANULADO`
- AND conserva causa y timestamp informados por la fuente externa

#### Escenario: Dos técnicos compiten

- GIVEN dos autorizaciones solicitadas para la misma orden
- WHEN una de ellas reclama primero la ejecución
- THEN la fuente externa rechaza cualquier consumo posterior para esa orden

### Requisito: Intención durable y recuperación

Antes de consumir autorización, el sistema DEBE (MUST) persistir una intención con `operation_id`. Si la app se interrumpe después del consumo, DEBE (MUST) marcar `PHYSICAL_UNKNOWN`, consultar ese identificador y exigir conciliación humana del resultado físico. NO DEBE (MUST NOT) repetirlo automáticamente.

#### Escenario: Cierre después del consumo

- GIVEN una intención persistida y autorización consumida
- WHEN la aplicación se cierra antes de confirmar el resultado físico
- THEN al volver marca `PHYSICAL_UNKNOWN`, consulta `operation_id` y bloquea repetición automática

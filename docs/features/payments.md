# Pagos y concurrencia

## Alcance

El técnico no recibe ni registra pagos en el flujo de corte. La cobranza y su integración oficial pertenecen a un sistema externo o a una fase posterior.

## Regla crítica

Si un pago confirmado ocurre antes de consumir la autorización de corte, el pago prevalece y la orden debe bloquearse/anularse según el estado autorizado, conservando causa, actor y fecha.

Timeout, `payment_detected`, conflicto o respuesta incierta nunca autorizan el corte.

## Implementación del piloto

El backend define el módulo interno `PaymentAuthority`, inyectable en `Application`, con decisiones `CLEAR`, `PAYMENT_CONFIRMED` y `UNKNOWN`. Recibe orden, cuenta, suministro, actor, dispositivo y `operation_id`. Se consulta dentro de la transacción PostgreSQL al reservar autorización y otra vez, inmediatamente antes de consumirla durante sync. Solo `CLEAR` continúa. Excepción, timeout, ausencia o respuesta inválida se convierten en `UNKNOWN`.

El servidor del piloto no tiene adapter ni fuente de pagos configurada; por eso responde `UNKNOWN` y bloquea nuevas reservas y consumos CUT. Una fuente inyectada tiene límite de espera configurable por `PAYMENT_AUTHORITY_TIMEOUT_MS` (default 3000 ms); timeout o excepción devuelven `UNKNOWN`. Los tests pueden inyectar un adapter determinista. No existe endpoint HTTP de pagos ni integración real. Disponibilidad HTTP sigue `NOT_IMPLEMENTED`; todo contrato sigue `PILOT_PROVISIONAL` y `TODO: VALIDAR CON SEPSA`.

Al observar `PAYMENT_CONFIRMED`, el servidor agrega un evento en `payment_observations`, ligado a operación, orden, cuenta, suministro, actor, dispositivo, fuente local `PILOT_PROVISIONAL` y fecha de observación. `operation_id` único hace idempotente el replay; trigger impide actualizar o borrar el evento. Auditoría registra solo decisión y fuente, nunca la respuesta cruda o credenciales. Una observación previa de esa cuenta/suministro bloquea operaciones CUT posteriores.

Para conservar la decisión sin crear un estado administrativo, la orden sigue en sus estados existentes y la operación de sync queda `conflict`, con motivo que exige revisión humana. La autorización queda `RESERVED` y sin consumir. `UNKNOWN` también deja sync en conflicto y requiere revisión, sin crear evento de pago ni reintentar acción física.

La consulta externa dentro de una transacción local no crea atomicidad con el ledger. Un pago puede confirmarse después de observar `CLEAR` y antes del commit local. Garantía real requiere contrato oficial y una operación de consumo autoritativa o coordinada. Fuente, identidad del evento, precedencia final y conciliación quedan `TODO: VALIDAR CON SEPSA`.

## Integridad

Un pago confirmado es un hecho histórico: no se sobrescribe ni se resuelve por última escritura gana. La futura integración debe ser idempotente y permitir conciliación humana cuando la respuesta sea incierta.

## Pendientes

Fuente oficial, eventos, contrato de autorización, estados administrativos, tarifas y continuidad de cobranza presencial: `TODO: VALIDAR CON SEPSA`.

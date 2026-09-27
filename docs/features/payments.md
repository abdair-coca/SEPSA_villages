# Pagos y concurrencia

## Alcance

El técnico no recibe ni registra pagos en el flujo de corte. La cobranza y su integración oficial pertenecen a un sistema externo o a una fase posterior.

## Regla crítica

Si un pago confirmado ocurre antes de consumir la autorización de corte, el pago prevalece y la orden debe bloquearse/anularse según el estado autorizado, conservando causa, actor y fecha.

Timeout, `payment_detected`, conflicto o respuesta incierta nunca autorizan el corte.

## Integridad

Un pago confirmado es un hecho histórico: no se sobrescribe ni se resuelve por última escritura gana. La futura integración debe ser idempotente y permitir conciliación humana cuando la respuesta sea incierta.

## Pendientes

Fuente oficial, eventos, contrato de autorización, estados administrativos, tarifas y continuidad de cobranza presencial: `TODO: VALIDAR CON SEPSA`.

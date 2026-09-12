# Propuesta: Prototipo de campo offline para cortes y reconexiones

## Intención

Crear una base evolutiva para una PWA móvil offline-first destinada al técnico de campo. El prototipo validará la ejecución segura de cortes y reconexiones asignados, con persistencia local, evidencias, autorización externa y sincronización posterior.

## Alcance

### Incluido

- Consulta local de órdenes asignadas al técnico.
- Validación online obligatoria antes de ejecutar un corte.
- Autorización única y de vigencia corta para operar con señal intermitente.
- Registro durable de cortes, reconexiones, visitas y evidencias.
- Cola de sincronización idempotente, reintentable y visible.
- Trazabilidad operativa consultable sin conexión.

### Excluido

- Emisión y asignación de órdenes.
- Cobranza, Kardex y recepción de pagos por el técnico.
- Lecturas de medidor.
- Backend o contrato definitivo de API SEPSA.
- Cartografía offline avanzada.
- Reglas financieras definitivas de reconexión.

## Capacidades

### Nuevas capacidades

- `paquete-trabajo-campo`: órdenes asignadas y contexto operativo local.
- `autorizacion-corte`: validación de pago reciente y autorización única.
- `ejecucion-corte`: registro seguro de cortes autorizados.
- `ejecucion-reconexion`: reconexión condicionada a habilitación externa.
- `persistencia-sincronizacion`: almacenamiento local, cola y reintentos.
- `trazabilidad-operativa`: historial verificable de acciones y estados.

### Capacidades modificadas

Ninguna. El prototipo `001-Boceto-mvp` permanece intacto como referencia histórica.

## Enfoque

Construir un vertical slice móvil con datos de prueba precargados y límites claros entre dominio, almacenamiento local e integraciones provisionales. Solo la autorización final del corte y la habilitación final de reconexión dependen de conectividad. Sin respuesta vigente no se ejecuta la acción física; la visita queda registrada para reintento. Un pago concurrente prevalece sobre una orden aún no ejecutada.

## Riesgos

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Señal insuficiente para autorizar | Alto | Solicitud mínima, reintentos y estado pendiente |
| Corte posterior a un pago | Alto | Autorización única, corta y pago prevalente |
| Reglas de reconexión incompletas | Alto | No inventar reglas; mantenerlas pendientes |
| Alcance excesivo | Medio | Excluir administración, cobros y GIS avanzado |

## Pendientes SEPSA

- Duración exacta de la autorización de corte.
- Regla definitiva de GPS y precisión exigida.
- Motivos permitidos para omitir evidencia fotográfica.
- Condiciones financieras que habilitan una reconexión.
- Procedimiento excepcional cuando no existe señal.

## Rollback

Retirar únicamente este cambio y su futura implementación. `boceto-mvp/` y la especificación `001` no se modifican.

## Criterios de éxito

- [ ] El técnico opera exclusivamente órdenes asignadas.
- [ ] Ningún corte ocurre sin autorización online vigente.
- [ ] Operaciones sobreviven cierre y reinicio.
- [ ] Reintentos no producen duplicados.
- [ ] El flujo supera pruebas reproducibles sin conexión, con timeout, pérdida de respuesta y recuperación de señal.

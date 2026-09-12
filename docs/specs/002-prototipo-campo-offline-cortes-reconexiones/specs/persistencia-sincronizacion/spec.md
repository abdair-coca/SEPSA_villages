# Especificación: Persistencia y sincronización

## Propósito

Garantizar que operaciones y evidencias sobrevivan conectividad intermitente, cierre y reinicio sin pérdida ni duplicación.

## Requisitos

### Requisito: Persistencia local previa

La aplicación DEBE (MUST) persistir operación, evidencias, cambio de estado de dominio y entrada de cola como una unidad local indivisible antes de mostrar confirmación. Ante interrupción, DEBE (MUST) recuperar todo el conjunto o conservar el estado anterior. NO DEBE (MUST NOT) confirmar una persistencia parcial.

#### Escenario: Operación offline

- GIVEN un dispositivo sin conexión
- WHEN la persistencia local finaliza correctamente
- THEN la aplicación confirma y marca la operación como `pending`

#### Escenario: Fallo de persistencia

- GIVEN una operación lista para confirmar
- WHEN no puede persistirse completamente
- THEN la aplicación informa el error y no confirma la operación

### Requisito: Cola durable

La cola DEBE (MUST) sobrevivir recarga, cierre y reinicio. Su estado de sincronización DEBE (MUST) usar `pending`, `syncing`, `synced` o `failed`, separado del estado de dominio. Una operación NO DEBE (MUST NOT) eliminarse antes de recibir acuse válido.

#### Escenario: Recuperación

- GIVEN operaciones `pending` almacenadas
- WHEN la aplicación vuelve a abrirse
- THEN recupera operaciones, evidencias y estados sin alteración

#### Escenario: Acuse ausente

- GIVEN una operación `syncing`
- WHEN se pierde la respuesta
- THEN la operación se conserva, pasa a `failed` y queda marcada como resultado incierto

#### Escenario: Reinicio durante sincronización

- GIVEN una operación quedó `syncing` al cerrarse la aplicación
- WHEN la aplicación vuelve a abrir
- THEN la marca como resultado incierto y consulta `operation_id` antes de reenviar

### Requisito: Identidad e idempotencia

Cada operación DEBE (MUST) recibir antes de persistirse un `operation_id` globalmente único y no predecible. Los reintentos con el mismo identificador NO DEBEN (MUST NOT) crear duplicados y DEBEN (MUST) recuperar el resultado original cuando ya exista.

#### Escenario: Reintento duplicado

- GIVEN una operación ya procesada
- WHEN se reenvía con el mismo `operation_id`
- THEN no se crea otra operación y se devuelve el resultado existente

#### Escenario: Estado incierto

- GIVEN una operación sin resultado conocido
- WHEN se consulta mediante `operation_id`
- THEN se obtiene el estado disponible sin crear otra operación

### Requisito: Reintentos no bloqueantes

La aplicación DEBE (MUST) reintentar operaciones `pending` o `failed` solo cuando conozca que no fueron procesadas. Si el resultado es incierto, DEBE (MUST) consultar primero mediante `operation_id`. NO DEBE (MUST NOT) reenviar una ejecución física mientras persista incertidumbre ni bloquear trabajo local.

#### Escenario: Conectividad recuperada

- GIVEN una operación `failed` por red
- WHEN vuelve conectividad útil
- THEN la aplicación consulta su resultado si existe incertidumbre
- AND solo reenvía cuando confirma que no fue procesada

### Requisito: Cola visible

El sistema DEBE (MUST) mostrar al técnico operaciones `pending`, `syncing` y `failed`, junto con cantidad de intentos y acción de reintento cuando sea segura.

#### Escenario: Consulta de pendientes

- GIVEN operaciones con distintos estados de sincronización
- WHEN el técnico abre el estado de sincronización
- THEN visualiza estado, intentos y errores accionables de cada operación

### Requisito: Conflictos preservados

Un conflicto DEBE (MUST) conservar datos locales, respuesta remota, evidencias y contexto para revisión. NO DEBE (MUST NOT) resolverse mediante última escritura gana.

#### Escenario: Conflicto remoto

- GIVEN una operación local incompatible con estado remoto
- WHEN se detecta el conflicto
- THEN se preservan ambas versiones y se marca el caso para revisión

# Especificación: Ejecución de reconexión

## Propósito

Registrar reconexiones habilitadas externamente sin procesar pagos ni duplicar la ejecución física.

## Requisitos

### Requisito: Elegibilidad de reconexión

El sistema DEBE (MUST) permitir reconexión solo para una orden asignada al técnico, previamente `EJECUTADO` y con habilitación externa vigente. La habilitación DEBE (MUST) ser verificable, ligada a orden, técnico, dispositivo y operación, y reclamar atómicamente la única reconexión permitida para esa orden. NO DEBE (MUST NOT) reconectar sin esas condiciones.

#### Escenario: Reconexión habilitada

- GIVEN una orden asignada cuyo corte fue `EJECUTADO`
- AND una habilitación externa vigente
- WHEN el técnico inicia la reconexión
- THEN el sistema permite registrar la ejecución

#### Escenario: Habilitación ausente

- GIVEN una orden ejecutada sin habilitación externa vigente
- WHEN el técnico intenta reconectar
- THEN el sistema bloquea la acción y muestra una explicación operativa

#### Escenario: Respuesta desconocida

- GIVEN que el adaptador responde `unknown`
- WHEN el técnico intenta continuar
- THEN el sistema bloquea la reconexión y conserva la visita para reintento

### Requisito: Separación de pagos

El técnico NO DEBE (MUST NOT) cobrar ni registrar pagos durante una reconexión. El adaptador provisional DEBE (MUST) responder `enabled`, `not_enabled` o `unknown`; solo `enabled` permite continuar. La fuente externa es responsable de verificar deuda y cargos de Otros Ingresos liquidados. Cálculos, aranceles y reglas financieras exactas quedan como `TODO: VALIDAR CON SEPSA`.

#### Escenario: Intento de cobro

- GIVEN una reconexión habilitada
- WHEN el técnico busca registrar un pago
- THEN el sistema no ofrece ni acepta esa acción

### Requisito: Prevención de doble reconexión

Antes de consumir habilitación, el sistema DEBE (MUST) persistir una intención con identificador único. Una reconexión confirmada o reclamada NO DEBE (MUST NOT) ejecutarse nuevamente. Si el resultado físico queda incierto, DEBE (MUST) marcarse `PHYSICAL_UNKNOWN` y conciliarse humanamente sin repetición automática.

#### Escenario: Reconexión repetida

- GIVEN una orden con reconexión ya confirmada
- WHEN el técnico intenta repetirla
- THEN el sistema bloquea la segunda ejecución y conserva la primera

#### Escenario: Habilitación reutilizada

- GIVEN una habilitación consumida por una reconexión previa
- WHEN otro intento presenta la misma habilitación
- THEN la fuente externa rechaza el intento sin crear otra reconexión

#### Escenario: Cierre después del consumo

- GIVEN una intención persistida y habilitación consumida
- WHEN la aplicación se cierra antes de confirmar el resultado físico
- THEN al volver marca `PHYSICAL_UNKNOWN`, consulta el identificador y bloquea repetición automática

### Requisito: Registro durable

El sistema DEBE (MUST) persistir localmente la reconexión y transicionar la orden a `RECONEXIÓN` antes de mostrar éxito. El registro DEBE (MUST) incluir orden, técnico, habilitación utilizada, fecha, identificador único y estado de sincronización separado.

#### Escenario: Confirmación local

- GIVEN una reconexión elegible
- WHEN el técnico confirma su ejecución
- THEN el sistema persiste la operación localmente
- AND la orden queda `RECONEXIÓN` con sincronización `pending`

#### Escenario: Cierre posterior

- GIVEN una reconexión persistida localmente
- WHEN la aplicación se cierra y vuelve a abrir
- THEN conserva operación y estado de sincronización

### Requisito: Resultado incierto

Si el resultado remoto no es concluyente, el sistema DEBE (MUST) conservar la operación para consulta y NO DEBE (MUST NOT) ordenar otra reconexión física automáticamente.

#### Escenario: Respuesta perdida

- GIVEN una reconexión enviada sin confirmación concluyente
- WHEN se recupera conectividad
- THEN el sistema consulta por identificador antes de reenviar

# Delta para Ejecución de corte

## MODIFIED Requirements

### Requisito: Elegibilidad del corte

El sistema DEBE (MUST) permitir ejecución solo para una orden asignada al Técnico, en estado `GENERADO`, con asignación y versión aún válidas, y autorización online concluyente consumida para esa operación. NO DEBE (MUST NOT) ejecutar si falta una condición. Una orden solo puede tener una ejecución reclamada.

(Previously: La elegibilidad no explicitaba revalidación de asignación y versión creadas por Administración.)

#### Escenario: Orden elegible

- GIVEN una orden `GENERADO` asignada al Técnico
- AND una autorización online consumida para esa operación
- WHEN el Técnico inicia el registro de corte
- THEN el sistema permite completar la ejecución

#### Escenario: Condición inválida

- GIVEN una orden ajena, anulada, reasignada o sin autorización válida
- WHEN el Técnico intenta ejecutarla
- THEN el sistema bloquea el corte
- AND registra causa y conflicto cuando corresponda

#### Escenario: Segunda ejecución concurrente

- GIVEN una orden cuya ejecución ya fue reclamada
- WHEN otra sesión intenta ejecutarla
- THEN el sistema bloquea la segunda ejecución

### Requisito: Datos de ejecución

El sistema DEBE (MUST) registrar visita, tipo de corte, medidores cercanos, lectura final, georreferenciación y evidencia fotográfica. GPS y fotografía admiten sus excepciones controladas; la lectura no admite excepción hasta validación con SEPSA. Una excepción fotográfica DEBE (MUST) incluir justificación no vacía, actor y timestamp. El Técnico NO DEBE (MUST NOT) registrar cobros dentro de este flujo.

(Previously: El flujo excluía lecturas y GPS y no explicitaba medidores cercanos.)

#### Escenario: Datos completos

- GIVEN una orden elegible y capturas válidas
- WHEN el Técnico confirma los datos
- THEN el sistema los vincula con orden, visita, Técnico y dispositivo

#### Escenario: Lectura faltante

- GIVEN una orden sin lectura final
- WHEN el Técnico intenta confirmar ejecución
- THEN el sistema bloquea el corte registrado
- AND permite guardar una visita sin ejecución

#### Escenario: Excepción fotográfica

- GIVEN que el Técnico no puede adjuntar evidencia
- WHEN activa explícitamente el bypass
- THEN el sistema audita la excepción
- AND no afirma que existe fotografía

### Requisito: Georreferenciación con excepción controlada

El sistema DEBE (MUST) capturar latitud y longitud WGS84, precisión disponible y timestamp. Sin coordenadas, DEBE (MUST) exigir activación explícita de `saltar_control_coordenadas` y auditar actor y timestamp. NO DEBE (MUST NOT) inventar ubicación. El umbral de precisión queda como `TODO: VALIDAR CON SEPSA`.

(Previously: GPS estaba fuera del prototipo y no se solicitaba.)

#### Escenario: GPS disponible

- GIVEN una visita con ubicación obtenida
- WHEN el Técnico registra el corte autorizado
- THEN persiste coordenadas, precisión y timestamp
- AND los vincula con la operación

#### Escenario: Bypass GPS

- GIVEN que el dispositivo no obtiene ubicación
- WHEN el Técnico activa la excepción controlada
- THEN el sistema audita actor, timestamp y bypass
- AND no inventa coordenadas

### Requisito: Persistencia antes del éxito

Al confirmar un corte, el sistema DEBE (MUST) persistir en una única operación atómica ejecución, visita, evidencia, capturas de campo, transición de la orden y entrada de sincronización antes de mostrar éxito. Un fallo parcial DEBE (MUST) revertir esa unidad sin eliminar la intención durable persistida antes del consumo. El estado físico y el estado de sincronización DEBEN (MUST) permanecer separados; sincronización inicia como `pending`.

(Previously: Se persistían operación y evidencia, sin lectura ni georreferenciación.)

#### Escenario: Confirmación durable

- GIVEN datos válidos y autorización consumida
- WHEN el Técnico confirma el corte
- THEN persiste la operación con identificador único
- AND marca orden `EJECUTADO` y sincronización `pending`

#### Escenario: Fallo local posterior al consumo

- GIVEN una intención durable y una autorización ya consumida
- AND la persistencia local del resultado no termina completamente
- WHEN el Técnico confirma
- THEN el sistema no informa éxito
- AND conserva la intención para marcar `PHYSICAL_UNKNOWN` y consultar `operation_id` antes de cualquier reintento

### Requisito: Intención durable y recuperación incierta

Antes de consumir autorización, el sistema DEBE (MUST) persistir una intención con `operation_id`. Si la aplicación se interrumpe después del consumo, DEBE (MUST) marcar `PHYSICAL_UNKNOWN`, consultar el resultado por ese identificador y exigir conciliación humana. NO DEBE (MUST NOT) repetir automáticamente la acción física ni reenviarla mientras persista incertidumbre.

(Previously: La recuperación incierta existía en el cambio 002, pero el delta multirol no explicitaba su aplicación al flujo ampliado.)

#### Escenario: Cierre después del consumo

- GIVEN una intención persistida y autorización consumida
- WHEN la aplicación se interrumpe antes de confirmar el resultado físico
- THEN al volver marca `PHYSICAL_UNKNOWN` y consulta `operation_id`
- AND bloquea repetición automática

#### Escenario: Respuesta remota perdida

- GIVEN una operación enviada sin respuesta concluyente
- WHEN se recupera conectividad
- THEN el sistema consulta el resultado por `operation_id`
- AND no reenvía la acción hasta resolver su estado

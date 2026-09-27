# Delta para Trazabilidad operativa

## MODIFIED Requirements

### Requisito: Registro completo

Cada evento DEBE (MUST) registrar actor, rol, dispositivo cuando corresponda, orden, acción, fechas, referencias de evidencia, `operation_id`, intentos, errores y estado de sincronización. La cadena DEBE (MUST) incluir creación, asignación, descarga, visita, autorización, resultado y sincronización. Un corte DEBE (MUST) registrar autorización; una visita sin ejecución, su motivo.

(Previously: El historial se concentraba en acciones de campo, autorización, habilitación y sincronización.)

#### Escenario: Cadena administrativa y técnica

- GIVEN una orden creada, asignada y ejecutada
- WHEN el Administrador consulta su historial
- THEN puede reconstruir actores, tiempos, evidencia y resultado
- AND distingue estados operativo, físico y de sincronización

#### Escenario: Operación fallida

- GIVEN un fallo durante registro o sincronización
- WHEN se registra la incidencia
- THEN conserva error, fecha, intento, actor, dispositivo y estado

#### Escenario: Visita sin ejecución

- GIVEN una visita bloqueada por autorización, pago o conflicto
- WHEN se persiste el resultado
- THEN conserva motivo y evidencia disponible
- AND no afirma que ocurrió un corte

### Requisito: Inmutabilidad histórica

Los eventos históricos NO DEBEN (MUST NOT) modificarse ni eliminarse silenciosamente. Reasignaciones, anulaciones, pagos concurrentes, respuestas inciertas y conflictos DEBEN (MUST) conservar estados anteriores, actor, fecha y causa. El sistema NO DEBE (MUST NOT) aplicar última escritura gana a resultados físicos o autorizaciones.

(Previously: La corrección administrativa quedaba fuera del prototipo y las inconsistencias solo se preservaban para revisión.)

#### Escenario: Reasignación o anulación

- GIVEN una orden modificada después de crearse
- WHEN se consulta su trazabilidad
- THEN conserva estado anterior, estado nuevo, actor y timestamp

#### Escenario: Conflicto histórico

- GIVEN resultados locales y remotos incompatibles
- WHEN el sistema detecta el conflicto
- THEN preserva ambas versiones y sus causas
- AND marca el caso para revisión

### Requisito: Minimización con consulta autorizada

El evento de auditoría DEBE (MUST) almacenar identificadores y metadatos necesarios, no copias innecesarias de Kardex ni datos personales. El Administrador DEBE (MUST) poder resolver esas referencias y consultar información operativa completa según sus permisos. El Técnico solo DEBE (MUST) recibir información de órdenes asignadas. Ningún rol DEBE (MUST) obtener secretos mediante trazabilidad.

(Previously: La consulta operativa estaba limitada al Técnico y no contemplaba resolución administrativa de referencias.)

#### Escenario: Consulta administrativa

- GIVEN un Administrador autenticado
- WHEN consulta una orden y su trazabilidad
- THEN visualiza eventos y datos operativos referenciados
- AND no accede a secretos o credenciales

#### Escenario: Consulta técnica offline

- GIVEN un Técnico con una orden asignada
- WHEN consulta historial almacenado localmente
- THEN recibe información necesaria para operar
- AND no recibe información de órdenes ajenas

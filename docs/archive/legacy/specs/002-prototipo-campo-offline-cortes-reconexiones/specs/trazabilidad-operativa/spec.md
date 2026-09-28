# Especificación: Trazabilidad operativa

## Propósito

Mantener un historial verificable de acciones de campo, consultable offline y protegido contra cambios silenciosos.

## Requisitos

### Requisito: Registro completo

Cada operación DEBE (MUST) registrar técnico, dispositivo, orden, acción, fechas, referencias de evidencia, `operation_id`, intentos, errores y estado de sincronización. Un corte DEBE (MUST) registrar autorización; una reconexión, habilitación; una visita sin ejecución, el motivo por el cual no existe ninguna.

#### Escenario: Operación exitosa

- GIVEN una acción autorizada sobre una orden
- WHEN queda persistida localmente
- THEN el historial permite determinar qué ocurrió, quién actuó, cuándo y con qué evidencia

#### Escenario: Operación fallida

- GIVEN un fallo durante registro o sincronización
- WHEN se registra la incidencia
- THEN el historial conserva error, fecha, intento, actor, dispositivo y estado

#### Escenario: Visita sin ejecución

- GIVEN una visita bloqueada por falta de autorización o habilitación
- WHEN se persiste el resultado
- THEN el historial conserva motivo y referencias de evidencia sin afirmar ejecución

### Requisito: Consulta offline

El historial DEBE (MUST) poder consultarse sin conexión con las operaciones, evidencias disponibles y estados almacenados localmente.

#### Escenario: Historial sin señal

- GIVEN operaciones previamente persistidas
- WHEN el técnico consulta historial sin conectividad
- THEN visualiza operaciones y estado local sin depender de respuesta remota

### Requisito: Inmutabilidad histórica

Las operaciones históricas NO DEBEN (MUST NOT) modificarse o eliminarse silenciosamente. La corrección administrativa queda fuera del prototipo; cualquier inconsistencia DEBE (MUST) conservarse para revisión.

#### Escenario: Conflicto histórico

- GIVEN resultados locales y remotos incompatibles
- WHEN el sistema detecta el conflicto
- THEN preserva ambos y los marca para revisión sin aplicar última escritura gana

### Requisito: Minimización de datos

El registro técnico DEBE (MUST) limitarse a identificadores de técnico, dispositivo, orden, operación, autorización o habilitación; acción, timestamps, referencias de evidencia, intentos, códigos de error y estado de sincronización. NO DEBE (MUST NOT) incluir credenciales, CI, teléfono, contenido binario de evidencias ni datos financieros completos.

#### Escenario: Consulta operativa

- GIVEN un técnico consultando una orden asignada
- WHEN visualiza historial y evidencias
- THEN recibe información suficiente para trabajar sin datos ajenos al propósito operativo

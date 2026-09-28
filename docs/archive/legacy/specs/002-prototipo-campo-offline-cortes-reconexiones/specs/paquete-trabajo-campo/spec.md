# Especificación: Paquete de trabajo de campo

## Propósito

Permitir que el técnico de campo consulte localmente sus órdenes asignadas y continúe trabajando cuando se pierda conectividad.

## Requisitos

### Requisito: Acceso limitado por asignación

El sistema DEBE (MUST) mostrar y permitir operar únicamente órdenes asignadas al técnico autenticado. Cada paquete DEBE (MUST) quedar vinculado al técnico y dispositivo que lo descargaron. El prototipo admite un solo técnico por dispositivo; cambiar usuario o dispositivo requiere nueva provisión online. NO DEBE (MUST NOT) permitir acceso operativo a órdenes ajenas ni reutilizar el paquete desde otra identidad.

#### Escenario: Consulta de órdenes asignadas

- GIVEN un técnico autenticado con órdenes asignadas
- WHEN abre su paquete de trabajo
- THEN visualiza únicamente sus órdenes asignadas

#### Escenario: Intento sobre orden ajena

- GIVEN una orden asignada a otro técnico
- WHEN el técnico intenta abrirla o iniciar una operación
- THEN el sistema rechaza la acción y no registra una ejecución

#### Escenario: Cambio de usuario sin conexión

- GIVEN un paquete descargado por un técnico
- WHEN otro usuario inicia o recupera una sesión en el dispositivo
- THEN el sistema bloquea acceso al paquete anterior
- AND exige provisión online para la nueva identidad

### Requisito: Paquete disponible sin conexión

Después de una descarga completa, el sistema DEBE (MUST) conservar localmente las órdenes y sus datos operativos. DEBE (MUST) validar autenticidad, integridad y versión del paquete, y mostrar fecha y hora de última actualización. Una descarga incompleta, alterada o inválida NO DEBE (MUST NOT) reemplazar el último paquete válido. Un paquete desactualizado puede consultarse, pero no sustituye la autorización online exigida para cortar.

#### Escenario: Consulta offline

- GIVEN un paquete descargado correctamente
- WHEN el dispositivo pierde conectividad
- THEN el técnico puede consultar las órdenes y datos ya descargados

#### Escenario: Descarga interrumpida

- GIVEN una descarga que no terminó
- WHEN el técnico intenta usarla sin conexión
- THEN el sistema conserva el último paquete válido o informa que no existe uno disponible

#### Escenario: Paquete alterado

- GIVEN un paquete alterado o con versión incompatible
- WHEN el sistema valida su contenido
- THEN lo rechaza y conserva el último paquete válido

### Requisito: Visita sin ejecución

El sistema DEBE (MUST) permitir registrar localmente una visita o intento sobre una orden asignada sin afirmar que hubo corte o reconexión.

#### Escenario: Señal insuficiente

- GIVEN una visita cuya acción requiere validación externa
- WHEN la señal no permite completar la validación
- THEN el sistema conserva el resultado como visita sin ejecución
- AND registra por separado su sincronización como `pending`

### Requisito: Límites funcionales

El paquete NO DEBE (MUST NOT) emitir o asignar órdenes, administrar Kardex, cobrar ni recibir pagos.

#### Escenario: Acción fuera del alcance

- GIVEN un técnico trabajando con una orden
- WHEN busca registrar un pago o cambiar la asignación
- THEN el sistema no ofrece ni ejecuta esa acción

# Delta para Paquete de trabajo de campo

## MODIFIED Requirements

### Requisito: Acceso limitado por asignación

El sistema DEBE (MUST) mostrar y permitir operar únicamente órdenes asignadas al Técnico autenticado. Cada paquete DEBE (MUST) quedar vinculado al Técnico y dispositivo que lo descargaron, y conservar origen administrativo, versión y estado de cada orden. El piloto admite un solo Técnico por dispositivo; cambiar identidad o dispositivo requiere nueva provisión online. NO DEBE (MUST NOT) permitir acceso operativo a órdenes ajenas ni reutilizar el paquete desde otra identidad.

(Previously: El paquete no incluía origen administrativo de órdenes creadas y asignadas dentro del piloto.)

#### Escenario: Consulta de órdenes asignadas

- GIVEN un Administrador creó y asignó una orden al Técnico
- WHEN el Técnico sincroniza su paquete
- THEN visualiza únicamente sus órdenes asignadas

#### Escenario: Intento sobre orden ajena

- GIVEN una orden asignada a otro Técnico
- WHEN intenta abrirla o iniciar una operación
- THEN el sistema rechaza la acción
- AND no registra una ejecución

#### Escenario: Cambio de usuario sin conexión

- GIVEN un paquete descargado por un Técnico
- WHEN otra identidad recupera sesión en el dispositivo
- THEN el sistema bloquea acceso al paquete anterior
- AND exige provisión online para la nueva identidad

### Requisito: Paquete disponible sin conexión

Después de una descarga completa, el sistema DEBE (MUST) conservar órdenes y datos operativos: identificadores, cliente, cuenta o suministro, dirección, referencias, medidor, Kardex, deuda, fecha de actualización y procedencia. DEBE (MUST) validar autenticidad, integridad y versión. Una descarga incompleta, alterada o inválida NO DEBE (MUST NOT) reemplazar el último paquete válido. Un paquete desactualizado puede consultarse, pero no sustituye la autorización online.

(Previously: El paquete no exigía explícitamente el contexto ampliado del piloto.)

#### Escenario: Consulta offline

- GIVEN un paquete descargado correctamente
- WHEN el dispositivo pierde conectividad
- THEN el Técnico consulta órdenes y contexto almacenados
- AND visualiza última actualización y procedencia

#### Escenario: Descarga interrumpida

- GIVEN una descarga que no terminó
- WHEN el Técnico intenta usarla sin conexión
- THEN el sistema conserva el último paquete válido
- AND informa si no existe uno disponible

#### Escenario: Paquete alterado

- GIVEN un paquete alterado o incompatible
- WHEN el sistema valida su contenido
- THEN lo rechaza
- AND conserva el último paquete válido

### Requisito: Límites funcionales

El paquete NO DEBE (MUST NOT) emitir ni asignar órdenes, editar o administrar Kardex, cobrar ni recibir pagos. DEBE (MUST) permitir consultar Kardex y deuda asociados a órdenes asignadas.

(Previously: Kardex estaba excluido completamente del paquete técnico.)

#### Escenario: Consulta permitida

- GIVEN un Técnico con una orden asignada
- WHEN consulta Kardex o deuda
- THEN visualiza la información disponible
- AND no puede editarla

#### Escenario: Acción fuera del alcance

- GIVEN un Técnico trabajando con una orden
- WHEN intenta crear órdenes, cambiar asignación o registrar pago
- THEN el sistema rechaza la acción
- AND no altera datos operativos

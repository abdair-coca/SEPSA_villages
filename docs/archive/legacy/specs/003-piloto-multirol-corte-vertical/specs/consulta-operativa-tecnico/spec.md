# Especificación: Consulta operativa del técnico

## Propósito

Ofrecer contexto suficiente para identificar y trabajar una orden asignada, incluso sin conexión.

## Requisitos

### Requisito: Contexto operativo completo

El sistema DEBE (MUST) mostrar los datos disponibles de orden, cuenta o suministro, cliente, dirección, referencias, medidor, deuda y Kardex, junto con fecha de actualización y procedencia. DEBE (MUST) respetar la certeza documentada de cada dato y NO DEBE (MUST NOT) inventar relaciones o valores ausentes.

#### Escenario: Consulta offline

- GIVEN una orden y su contexto descargados correctamente
- WHEN el Técnico consulta sin conectividad
- THEN visualiza el último contexto válido
- AND distingue fecha, procedencia y datos ausentes

#### Escenario: Contexto incompleto

- GIVEN una orden con información parcial
- WHEN el Técnico abre el detalle
- THEN el sistema identifica cada ausencia relevante
- AND no reemplaza datos faltantes con valores inferidos

### Requisito: Vigencia y operabilidad

Antes de conocer un cambio remoto, el último paquete válido PUEDE (MAY) mostrar una asignación desactualizada, pero NO DEBE (MUST NOT) habilitar ejecución sin revalidación online. Una vez conocida una reasignación o anulación, el sistema DEBE (MUST) retirar el contexto operativo de la jornada anterior y conservar solo auditoría mínima de acciones propias y operaciones pendientes necesarias para sincronizar.

#### Escenario: Orden vigente

- GIVEN una orden asignada y vigente
- WHEN el Técnico abre su jornada
- THEN puede consultar el contexto y preparar la visita

#### Escenario: Orden cambiada durante desconexión

- GIVEN una orden local modificada remotamente
- WHEN el Técnico recupera conexión y solicita autorización
- THEN el sistema bloquea la ejecución si ya no es operable
- AND retira el contexto operativo después de conservar causa, versión y operaciones propias pendientes

### Requisito: Kardex de solo consulta

El Técnico DEBE (MUST) consultar Kardex y deuda asociados a su orden. NO DEBE (MUST NOT) editar, corregir, cobrar ni administrar esa información desde el flujo de corte.

#### Escenario: Consulta de Kardex

- GIVEN un Kardex disponible para una orden asignada
- WHEN el Técnico abre el detalle
- THEN visualiza historial y deuda disponibles
- AND no recibe controles de edición o cobro

#### Escenario: Modificación intentada

- GIVEN un Técnico consultando Kardex
- WHEN intenta modificar deuda o historial
- THEN el sistema rechaza la acción
- AND conserva los datos originales

### Requisito: Localización redundante

Dirección y referencias DEBEN (MUST) permanecer disponibles como medio textual. El mapa DEBE (MUST) complementar esa información y NO DEBE (MUST NOT) ser el único medio para localizar el suministro.

#### Escenario: Mapa disponible

- GIVEN una orden con dirección y ubicación cartográfica
- WHEN el Técnico consulta el detalle
- THEN visualiza mapa, dirección y referencias

#### Escenario: Mapa no disponible

- GIVEN un fallo cartográfico o ausencia de conexión
- WHEN el Técnico consulta el detalle
- THEN conserva dirección y referencias descargadas
- AND la consulta de la orden continúa operativa

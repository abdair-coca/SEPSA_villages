# Especificación: Gestión de órdenes de corte

## Propósito

Permitir que el Administrador localice suministros morosos, cree una orden individual y la asigne sin duplicar trabajo activo.

## Requisitos

### Requisito: Búsqueda de morosos

El sistema DEBE (MUST) permitir al Administrador buscar suministros morosos mediante campos confirmados, incluidos Área, Localidad y Ruta cuando estén disponibles. Cada resultado DEBE (MUST) mostrar cuenta o suministro, cliente, medidor, deuda, fecha de actualización y procedencia. Los campos provisionales DEBEN (MUST) identificarse y NO DEBEN (MUST NOT) convertirse en reglas definitivas.

#### Escenario: Moroso localizado

- GIVEN un Administrador autenticado y registros disponibles
- WHEN aplica criterios de búsqueda confirmados
- THEN el sistema muestra resultados coincidentes
- AND identifica fecha de actualización y procedencia

#### Escenario: Sin resultados

- GIVEN criterios válidos sin suministros coincidentes
- WHEN el Administrador ejecuta la búsqueda
- THEN el sistema muestra un resultado vacío comprensible
- AND no habilita creación sobre registros inexistentes

### Requisito: Creación individual

El Administrador DEBE (MUST) revisar el contexto antes de crear una orden individual. La orden DEBE (MUST) conservar identificador único, cuenta o suministro, saldo de referencia, creador, fecha, versión y estado.

#### Escenario: Orden creada

- GIVEN un suministro moroso con identificador confirmado
- WHEN el Administrador confirma la creación individual
- THEN el sistema crea una orden en estado inicial
- AND registra creador, fecha, versión y saldo de referencia

#### Escenario: Identidad operativa insuficiente

- GIVEN un registro sin identificador confirmado de cuenta o suministro
- WHEN el Administrador intenta crear una orden
- THEN el sistema rechaza la creación
- AND explica el dato requerido

### Requisito: Creación masiva por lote

El Administrador DEBE (MUST) poder seleccionar resultados de una búsqueda filtrada y preparar un lote de órdenes de corte. El sistema DEBE (MUST) mostrar cantidad y deuda referencial antes de confirmar, usar un identificador único de lote, impedir duplicados activos por cuenta y propósito, devolver creadas y omitidas, y registrar auditoría del lote y de cada orden creada.

#### Escenario: Lote confirmado

- GIVEN resultados filtrados y suministros seleccionados
- WHEN el Administrador revisa y confirma el lote
- THEN el sistema crea órdenes solo para suministros elegibles
- AND informa cantidad creada y omitida con causa
- AND un reintento con el mismo identificador devuelve el resultado original sin duplicar órdenes

### Requisito: Prevención de duplicados

El sistema DEBE (MUST) impedir otra orden activa para la misma cuenta y propósito. Un reintento con el mismo identificador de operación DEBE (MUST) devolver el resultado previo sin crear duplicados.

#### Escenario: Orden activa existente

- GIVEN una orden activa para la misma cuenta y propósito
- WHEN el Administrador intenta crear otra
- THEN el sistema bloquea el duplicado
- AND muestra la orden existente

#### Escenario: Confirmación repetida

- GIVEN una creación previamente confirmada
- WHEN se reintenta con el mismo identificador de operación
- THEN el sistema devuelve el resultado original
- AND mantiene una sola orden

### Requisito: Asignación individual

El Administrador DEBE (MUST) asignar la orden a un Técnico identificado. Asignación, reasignación o anulación DEBEN (MUST) usar identificador único de operación, validar versión, incrementar versión y conservar actor, fecha, estado anterior y resultado. Reintentar el mismo identificador DEBE (MUST) devolver el resultado previo sin repetir la transición. NO DEBEN (MUST NOT) sobrescribir silenciosamente el historial.

#### Escenario: Asignación confirmada

- GIVEN una orden válida y un Técnico habilitado
- WHEN el Administrador confirma la asignación
- THEN la orden queda vinculada al Técnico
- AND registra actor, fecha y versión

#### Escenario: Administración sin conexión

- GIVEN que la operación administrativa requiere conectividad
- WHEN no obtiene confirmación autoritativa
- THEN el sistema no informa creación o asignación exitosa
- AND conserva un mensaje accionable sin inventar estado

#### Escenario: Reintento de asignación

- GIVEN una asignación previamente confirmada
- WHEN se reintenta con el mismo identificador de operación
- THEN el sistema devuelve el resultado anterior
- AND no incrementa nuevamente la versión

### Requisito: Dashboard operacional

El Administrador DEBE (MUST) consultar estados operativos, físicos y de sincronización por separado. La vista DEBE (MUST) distinguir como mínimo órdenes sin asignar, `GENERADO`, `EJECUTADO`, `ANULADO`, resultados bloqueados y `PHYSICAL_UNKNOWN`, además de sincronización `pending`, `syncing`, `synced` y `failed`, con acceso a su trazabilidad.

#### Escenario: Seguimiento completo

- GIVEN órdenes en distintos estados
- WHEN el Administrador abre el dashboard
- THEN visualiza su estado operativo y de sincronización por separado
- AND puede abrir el historial de cada orden

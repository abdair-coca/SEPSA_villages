# Especificación 006: Rediseño de pantalla administrativa

## Propósito

Rediseñar el dashboard administrativo de órdenes de corte para replicar fielmente la referencia visual aprobada en distribución, jerarquía, componentes, tipografía, colores e iconografía, sin alterar permisos, dominio, persistencia, sincronización ni trazabilidad.

## Alcance

- Validación visual principal en escritorio de 1440 px.
- La referencia se replica excepto el sidebar, que no forma parte del producto.
- Datos, estados, contadores y textos variables provienen de fuentes dinámicas existentes.
- Se conservan creación individual, creación masiva, asignación y auditoría.
- Órdenes recientes visibles con paginación.
- Ficha integral visible únicamente después de seleccionar una orden.
- Datos `PILOT_PROVISIONAL` conservan su procedencia en el dominio, sin mostrar una advertencia visual persistente en la interfaz.

## Requisitos

### Requisito: Composición visual administrativa

La pantalla DEBE reproducir la referencia con header institucional, título, subtítulo, estado de ambiente, seis tarjetas KPI, stepper de cuatro pasos, panel de suministros morosos, panel de creación/asignación, órdenes recientes y ficha integral. NO DEBE agregar sidebar.

#### Escenario: Carga en escritorio

- GIVEN un administrador autenticado
- WHEN abre la pantalla en 1440 px
- THEN observa la composición y jerarquía visual de la referencia
- AND no observa navegación lateral no existente en el producto

### Requisito: Datos dinámicos y métricas

Los componentes DEBEN renderizar datos de la autoridad y estado actuales, nunca valores estáticos. Los KPI DEBEN mostrar `Generadas`, `Sin asignar`, `Asignadas`, `Ejecutadas`, `Anuladas` y `Trazas`. `Trazas` DEBE distinguir eventos de auditoría y operaciones de sincronización para conservar legibilidad.

#### Escenario: Actualización de órdenes

- GIVEN una orden cambia de estado o asignación
- WHEN la pantalla actualiza sus datos
- THEN los KPI y estados visibles reflejan el nuevo resultado
- AND no se conserva un contador hardcodeado

### Requisito: Búsqueda, creación y asignación

La pantalla DEBE conservar búsqueda y filtros de morosidad, selección de suministro, creación individual, asignación de técnico y creación masiva con sus validaciones, idempotencia y auditoría existentes.

#### Escenario: Creación masiva disponible

- GIVEN resultados filtrados y suministros seleccionables
- WHEN el administrador abre la acción de creación masiva
- THEN puede revisar y confirmar el lote
- AND la operación conserva omisiones, duplicados, idempotencia y auditoría

### Requisito: Órdenes recientes y ficha condicional

Las órdenes recientes DEBEN mostrar datos dinámicos, estado, fecha y acceso a páginas posteriores. La ficha integral NO DEBE mostrarse como detalle activo hasta seleccionar una orden.

#### Escenario: Selección de orden

- GIVEN el administrador observa órdenes recientes
- WHEN selecciona una orden
- THEN aparece su ficha integral con contexto, deuda, información adicional y trazabilidad
- AND al cambiar la selección se actualiza la ficha correspondiente

### Requisito: Campos operativos y ausencia de datos

La ficha PUEDE mostrar tarifa, teléfono, circuito, coordenadas catastrales, reclamos, plan de pago, fecha de suspensión, reconexión manual, marca e índice de medidor y orden de ruta cuando existan en el contexto. Un campo ausente DEBE mostrar `Dato no disponible`; la interfaz NO DEBE inventar significado ni valor SEPSA.

#### Escenario: Dato provisional o ausente

- GIVEN un campo vacío o marcado `TODO: VALIDAR CON SEPSA`
- WHEN se renderiza la ficha
- THEN muestra estado de disponibilidad y fuente provisional cuando corresponda
- AND no lo presenta como dato oficial de SEPSA

### Requisito: Implementación validada por fases

La implementación DEBE ejecutarse en tres fases independientes. Cada fase DEBE detenerse hasta recibir validación explícita del usuario; ninguna fase posterior puede comenzar antes de esa aprobación.

#### Escenario: Puerta de validación

- GIVEN una fase implementada y verificada
- WHEN se entrega evidencia al usuario
- THEN el trabajo queda pausado
- AND la siguiente fase solo inicia tras aprobación explícita

## Fases

1. **Fase 1 — Composición visual:** header, KPIs, stepper y paneles según referencia, usando datos dinámicos actuales. Validación en 1440 px.
2. **Fase 2 — Interacción y datos:** filtros, creación individual/masiva, asignación, órdenes paginadas, selección y ficha condicional. Validación funcional.
3. **Fase 3 — Calidad:** estados de carga, vacío, error y datos faltantes; responsive; trazabilidad, pruebas y comparación final.

## Criterios de aceptación

- [ ] Cada fase fue validada explícitamente antes de continuar.
- [ ] La composición coincide visualmente con referencia, excepto sidebar.
- [ ] No existen métricas ni datos variables hardcodeados.
- [ ] Creación masiva y auditoría permanecen disponibles.
- [ ] Órdenes recientes tienen paginación funcional.
- [ ] Ficha integral aparece solo con una orden seleccionada.
- [ ] Datos provisionales y ausentes se identifican correctamente.
- [ ] `npm run build` y `npm test -- --run` pasan.
- [ ] No se modifican permisos, dominio, persistencia ni contratos de backend.

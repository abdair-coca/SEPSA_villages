# Sistema visual operativo de SEPSA

Este documento guía administración web y PWA de campo. Prioridad de lectura: **persona, situación, acción, detalle técnico**. Consultar `docs/constitution.md` para reglas del producto; aquí solo se define cómo presentarlas. El primer flujo completo es una orden individual; operación masiva vendrá después.

## Jerarquía de información

1. **Persona y situación:** cliente, ubicación, deuda, estado operativo y actualización de datos.
2. **Acción:** siguiente paso disponible, bloqueo o decisión requerida.
3. **Detalle operativo:** cuenta, medidor, ruta, técnico, fechas, Kardex y evidencia pertinente.
4. **Detalle técnico:** identificadores, dispositivo y trazas en vistas secundarias o diagnóstico.

No titular vistas con UUID o códigos internos. Mostrar identificadores completos y copiables cuando una tarea operativa los necesite. Una acción principal por contexto, con verbos concretos. Diferenciar acciones secundarias y destructivas. Nunca insinuar que un corte bloqueado puede ejecutarse.

## Administración

El recorrido inicial es buscar suministro moroso, revisar contexto y deuda, crear y asignar **una** orden, luego consultar resultado y trazabilidad. Mostrar filtros confirmados de área, localidad, ruta, facturas vencidas y estado; si el significado de algún dato falta, marcarlo `TODO: VALIDAR CON SEPSA`. El contexto seleccionado debe permitir verificar suministro, medidor, deuda, orden activa y técnico antes de confirmar.

Usar filas o tablas compactas para búsqueda y auditoría; conservar encabezados y números legibles. Una orden activa dirige a su detalle en lugar de ofrecer creación duplicada. Priorizar sin asignar, bloqueos, conflictos y resultados físicos; separar estado operativo de estado de sincronización. Los lotes futuros requieren selección, vista previa y confirmación visibles, sin ocupar el flujo individual inicial.

## Campo

La jornada muestra solo órdenes asignadas, última actualización y conexión. La orden actual domina: cliente, dirección y referencias, medidor, deuda, Kardex y estado; mapa como apoyo. Antes de la acción física, exponer lectura, GPS, evidencia y autorización. Diferenciar claramente listo, pendiente, bloqueado y resultado físico incierto. Una autorización ausente, vencida o incierta muestra bloqueo y siguiente paso seguro.

El registro de visita y datos de campo debe poder completarse sin red; el corte requiere autorización online válida. La confirmación de guardado aparece solo tras persistencia local. Reducir escritura, navegación y desplazamiento; facilitar uso con una mano y controles grandes.

## Estados, conexión y errores

Mostrar por separado **guardado en dispositivo**, **pendiente de sincronización**, **sincronizando**, **sincronizado** y **falló la sincronización**. Indicar qué operación sigue guardada y cómo reintentar o pedir revisión. Conexión ausente no debe ocultar el último paquete válido. En estados vacíos, indicar situación y acción útil. Errores y conflictos conservan el contexto visible y usan lenguaje operativo, no trazas técnicas. No usar color como único portador del estado.

## Layout y responsive

Mantener encabezado con rol, vista, conectividad y fecha de actualización cuando corresponda. En escritorio, administración puede mostrar búsqueda y contexto en paralelo; campo prioriza orden y acción, con mapa y sincronización secundarios. En ancho estrecho, apilar secciones según prioridad de tarea y mantener acción, estados y texto completos. Usar tablas solo donde ayuden a comparar datos; en campo móvil, preferir bloques legibles. El mapa complementa dirección y referencias, nunca las reemplaza.

## Tokens visuales mínimos

| Uso | Token |
|---|---|
| Fondo | `#F6F3ED` |
| Superficie | `#FFFFFF` |
| Texto principal | `#172033` |
| Texto secundario | `#667085` |
| Borde | `#E5E7EB` |
| Acción y selección | `#E85D04` |
| Éxito | `#1F9D61` |
| Pendiente | `#D99A16` |
| Error o bloqueo | `#D92D20` |
| Información | `#2563EB` |

Usar tipografía legible, espaciado consistente y superficies sobrias. Reservar rojo para error, bloqueo o acción destructiva; deuda normal no es error. Estados combinan texto y señal visual.

## Accesibilidad y revisión

Foco visible, navegación por teclado en administración, etiquetas persistentes, contraste WCAG AA y objetivos táctiles de al menos 44 px en campo. Acciones críticas llevan texto; iconos no las sustituyen. No bloquear toda la pantalla si solo se actualiza una sección.

Antes de aprobar una pantalla:

- ¿Se identifica persona, situación y siguiente acción sin leer códigos internos?
- ¿Deuda, fecha de datos, bloqueo y estado de sincronización son inequívocos?
- ¿El flujo funciona con red intermitente y explica qué quedó guardado?
- ¿Se puede operar con teclado o tacto, sin depender solo de color?

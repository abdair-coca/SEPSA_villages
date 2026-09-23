# Spec 007 — Estandarización UX con prioridad en Técnico móvil

**Estado:** Fase 2 cerrada; Fase 3 iniciada. Revisión de `gpt-6-luna` confirmó Fase 2 tras corregir un hallazgo P2 de filtros. Usuario puede inspeccionar cada entrega; su aceptación no es gate.
**Tipo:** auditoría UX/UI y rediseño incremental en cinco fases, con revisión visual y funcional por agentes `gpt-6-luna`.
**Roles:** Técnico y Administrador.
**Paleta y estilo:** conservar los definidos en [`docs/design.md`](../../design.md).

## Resultado esperado

El Técnico podrá identificar y revisar rápidamente la orden que debe atender, y completar cada paso de campo en pantallas móviles breves, legibles y sin scroll vertical. El Administrador conservará su flujo operativo y podrá confirmar una asignación con rapidez. Ambos roles se sentirán parte del mismo sistema, aunque sus vistas sigan optimizadas para responsabilidades distintas.

No se cambiarán reglas de negocio, permisos, contratos del backend ni el significado de los datos. No se eliminará ni sobrescribirá información existente. Las fases avanzan autónomamente tras revisión visual y funcional de `gpt-6-luna`; el usuario puede inspeccionar cada entrega, pero su aceptación no bloquea avance.

## Hallazgos iniciales de auditoría

La revisión preliminar del código y de las guías visuales señala oportunidades concretas; todavía no equivale a pruebas de campo con usuarios:

- La vista de jornada técnica compite por atención entre la orden actual, mapa, readiness, estado y acciones.
- El formulario de ejecución reúne en un mismo contexto datos y decisiones de lectura, ubicación, excepciones, evidencia y confirmación.
- Los estados se repiten visualmente como badges, lo que añade ruido en vez de orientar la siguiente acción.
- Administración y campo expresan patrones de interfaz distintos, aunque `docs/design.md` establece que comparten sistema visual.
- Administración ya tiene tareas operativas útiles —búsqueda, filtros, selección múltiple y asignación— que deben preservarse.

La auditoría no concluye que deban desaparecer datos de contexto, controles de seguridad o capacidades administrativas: deben jerarquizarse o mostrarse en su momento de uso.

## Objetivos medibles

1. **Revisión técnica en ≤3 segundos:** con Jornada ya cargada y órdenes disponibles, desde tocar la orden prioritaria hasta ver un resumen estable con identidad del cliente, cuenta/medidor, dirección, deuda y estado. Se medirá en móvil y con los datos ya disponibles localmente; no incluye descarga inicial ni autorización de corte.
2. **Asignación administrativa en ≤3 segundos:** con la orden elegible visible y el técnico destino ya seleccionado o conocido, llegar desde ese contexto a confirmar la asignación. Buscar una orden desde cero, completar filtros o resolver un bloqueo no forma parte de esta medición.
3. **Sin scroll vertical en la experiencia técnica:** cada pantalla principal del flujo cabe dentro del viewport disponible, sin contenido crítico cortado. Incluye pantallas de captura con teclado abierto y áreas seguras del dispositivo.
4. **Menos carga visual:** una acción primaria por vista y sin duplicar badges para repetir un estado ya claro. Conservar texto e indicadores necesarios para comprender conexión, sincronización, bloqueo y resultado.
5. **Integridad:** ninguna fase elimina datos, modifica estados de dominio, relaja autorización o cambia contratos existentes.

## Decisiones de alcance confirmadas

- La prioridad de eficiencia y facilidad es el flujo del Técnico en móvil. Administración se armoniza visualmente y se conserva funcionalmente.
- Las dos experiencias comparten una misma base visual con variaciones justificadas por rol.
- Se conserva el estilo institucional y la paleta existente; no se introducen colores nuevos ni se reemplaza la identidad visual.
- La meta de 3 segundos para Técnico cubre abrir y revisar el contexto de la orden, no completar ni autorizar el corte.
- Cada etapa de captura se separa en pantallas cortas; las excepciones de GPS/fotos tienen un paso propio.
- La experiencia no tendrá scroll vertical en móvil. Se evaluará en retrato a 320×568, 360×640 y 390×844 px, con áreas seguras y teclado visible.
- Mapa, trazas y otra información secundaria no compiten con el resumen primario; continúan accesibles donde corresponda.
- La ejecución seguirá siendo offline-first, con persistencia local durable. Ningún rediseño habilita un corte sin autorización online concluyente, vigente y de un solo uso.

## Requisitos funcionales y de UX

### Sistema visual común

- Reutilizar los tokens y patrones definidos en `docs/design.md` para tipografía, superficies, botones, espaciado, estados y accesibilidad.
- Un estado se comunica con una etiqueta legible y, cuando aporte valor, un indicador semántico. Evitar colecciones de chips repetidos que no habilitan una decisión.
- Mantener una acción primaria inequívoca por contexto. Acciones secundarias no deben competir visualmente.
- Priorizar nombre y situación operacional sobre IDs. Los datos técnicos permanecen disponibles sin dominar la pantalla.
- No depender solo del color para comunicar estado; conservar contraste y tamaños táctiles adecuados.

### Técnico móvil

- Jornada muestra primero la orden prioritaria y una vía simple para recorrer el resto sin listas largas; la paginación o selección no debe ocultar el orden real ni omitir órdenes.
- El resumen de orden prioriza cliente, cuenta/medidor, dirección, deuda y estado. Mapa y detalles secundarios quedan separados.
- Captura se divide en pasos breves para lectura, GPS, evidencia y revisión final. Los controles y excepciones existentes permanecen disponibles y explícitos.
- Teclado, área segura, encabezado y acción del paso actual no deben ocultarse entre sí. El botón o mecanismo de avance se mantiene visible cuando el teclado está abierto.
- Si falta un dato, se comunica como ausente; no se inventan valores ni se confunde ausencia con cero o éxito.
- Conectividad y sincronización se presentan de forma compacta y comprensible. Estar offline no interrumpe acciones locales válidas ni hace creer que ya hubo sincronización.

### Administrador

- Preservar búsqueda, filtros actuales, selección múltiple, selección a través de páginas y asignación grupal.
- No cambiar el comportamiento ni eliminar capacidades para lograr coherencia visual.
- Hacer evidente el contexto de la orden, técnico elegido, bloqueos y confirmación antes de asignar.

## Datos, persistencia y seguridad

- Mantener sin cambios el modelo de dominio existente, identificadores, permisos, transiciones, backend, APIs y cola de sincronización.
- La creación del borrador local será una ampliación aditiva de IndexedDB: no borrar ni transformar stores o registros existentes. La migración debe poder abrir los datos previos.
- Guardar borradores de captura localmente, identificados por técnico, dispositivo, orden y acción con los identificadores estables ya disponibles en la aplicación. No crear identidades de negocio ficticias; si falta alguno, documentar el bloqueo y pedir decisión antes de implementarlo.
- El borrador debe permitir restaurar campos, evidencia seleccionada o persistida y justificación de excepción tras recarga o cierre. Los borradores no entran a la cola de sincronización ni representan operaciones completadas.
- Al completar, retirar el borrador solo después de verificar que la operación, sus evidencias y la entrada de cola requerida quedaron guardadas de manera durable. La limpieza no puede preceder a esa verificación.
- Si falla el guardado local, permanecer en el paso actual, conservar lo que aún exista en memoria y explicar que no se pudo guardar; no mostrar éxito ni avanzar como si persistió.
- GPS y evidencia mantienen los controles y excepciones confirmados. La justificación es obligatoria cuando el flujo de dominio así lo exige; no se inventan nuevas reglas.
- La autorización online continúa siendo concluyente, vigente y de un solo uso inmediatamente antes del corte. Timeout, desconexión o resultado incierto nunca habilitan la acción.

## Fases y revisiones

Cada fase se entrega como vista funcional ejecutable en la aplicación y evidencia visual inspeccionable en los tres tamaños acordados. Se reportarán defectos conocidos y verificaciones realizadas. `gpt-6-luna` revisa visual y funcionalmente; corrige hallazgos antes de avanzar. El usuario puede inspeccionar cada entrega sin constituir gate. Se mantienen las cinco fases y todos sus criterios de evidencia y seguridad.

| Fase | Entrega que se revisará | Criterios visuales y funcionales |
|---|---|---|
| **1. Lenguaje visual compartido** | Patrones comunes aplicados a Admin y Técnico: jerarquía, botones, tarjetas y estados. | Se reconoce el mismo sistema sin cambiar paleta/estilo; bajan los badges repetidos; el flujo administrativo conserva su comportamiento. Evidencia de ambos roles. |
| **2. Jornada y órdenes en móvil** | Jornada técnica compacta con orden prioritaria, navegación acotada y estados de conexión/sync. **Cerrada.** | Browser local autenticado: Jornada y Mis órdenes sin scroll vertical a 320×568, 360×640 y 390×844 (`scrollHeight=clientHeight`). Filtros en popover 2×3 muestran sus cinco opciones a 320 px sin scroll de página horizontal/vertical; seleccionar opción cierra popover. CTA y paginación visibles. `gpt-6-luna` encontró P2 en filtros; corregido y revisión confirmó lo demás. Sin capturas con datos personales en repo. |
| **3. Revisión de orden** | Resumen de contexto de la orden; mapa y datos secundarios quedan en vistas separadas. | Los cinco datos prioritarios se entienden de un vistazo; prueba de apertura y revisión ≤3 s desde Jornada cargada, también con datos locales. |
| **4. Captura segura sin scroll** | Flujo por pasos para lectura, GPS, evidencia, excepciones y revisión final; restauración de borrador. | Ningún paso tiene scroll vertical ni control crítico oculto con teclado/área segura; borrador sobrevive recarga; autorización incierta bloquea corte; falla de persistencia no permite avanzar como éxito. |
| **5. Admin y revisión integrada** | Pulido Admin y recorrido conjunto; revisión de mapa, sincronización y vistas técnicas secundarias. | Se preservan filtros, selección múltiple y asignación grupal; confirmación de asignación ≤3 s bajo el contexto definido; experiencia técnica completa validada sin scroll vertical y coherente entre roles. |

### Protocolo de revisión por fase

1. Dejar la vista ejecutable y reunir evidencia en los viewports acordados; el agente puede usar navegador y capturas.
2. `gpt-6-luna` revisa evidencia visual y funcional, registra defectos y límites sin inventar resultados.
3. Corregir hallazgos de la fase actual y repetir revisión antes de avanzar.
4. Tras revisión satisfactoria, continuar autónomamente con fase siguiente; no esperar aceptación del usuario.
5. El usuario puede inspeccionar cada entrega y aportar observaciones, sin bloquear el avance.

## Verificación requerida

- Capturas en vertical a **320×568**, **360×640** y **390×844 px**, registrando dispositivo/escala cuando sea posible.
- En captura: repetir evaluación con teclado visible y áreas seguras; confirmar que input, contenido, error de guardado y avance permanecen utilizables sin scroll vertical.
- Revisar estados: sin órdenes, datos ausentes, offline, pendiente/fallida la sincronización, GPS/foto disponibles y excepciones justificadas.
- Probar restauración de borradores al recargar/reabrir y verificar que no se duplican ni aparecen como operaciones sincronizables.
- Probar fallo de escritura local: el paso no avanza ni informa éxito y no se limpia el borrador.
- Confirmar que autorización ausente, rechazada, vencida o incierta mantiene bloqueado el corte.
- Verificar Admin con filtros, selección múltiple y asignación grupal antes/después del ajuste visual.
- Registrar tiempo de tareas con el punto de inicio y fin definidos en “Objetivos medibles”; no presentar una estimación como resultado medido.
- Confirmar que los datos y operaciones previos siguen presentes. Cualquier migración debe verificarse sobre una copia de prueba antes de usar datos reales.

## Fuera de alcance

- Cambiar paleta, marca o estilo visual aprobado.
- Cambiar reglas de deuda, autorización, GPS, evidencia, estados, permisos o trazabilidad.
- Cambiar contratos API, backend o modelo de dominio para acomodar la UI.
- Eliminar información o capacidades administrativas para simplificar pantallas.
- Implementar métricas, dashboards, automatización o funciones de negocio nuevas.
- Declarar la meta de 3 segundos cumplida sin prueba visual/temporal reproducible.

## Estado y siguiente paso

**Estado actual:** Fase 2 cerrada; Fase 3 iniciada. Fase 1 conserva QA visual independiente pendiente; revisión integrada final podrá cubrirla. Fase 3 sigue abierta.
**Evidencia Fase 2:** código asociado a commit `cbee456`. Suite previa: `npm test -- --run`, 17 archivos/143 pruebas; build aprobado. Tras último ajuste `aria-label` y `min-height:44`: UI 14/14 y build aprobados. No consta suite total posterior a ese ajuste. Revisión en browser local autenticado confirmó medidas de viewport indicadas arriba; no se guardaron capturas con datos personales en repo.
**Siguiente paso:** completar y verificar Fase 3 según criterios; no declarar terminada hasta reunir evidencia y revisión requeridas. El usuario puede inspeccionar la entrega en cualquier momento.

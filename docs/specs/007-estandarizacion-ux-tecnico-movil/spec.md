# Spec 007 — Estandarización UX con prioridad en Técnico móvil

**Estado:** Fase 4 revisada y cerrada para QA local disponible; commits `adce142` (migración IndexedDB v2 aditiva y borradores por alcance) y `f1772ca` (asistente compacto de captura). `gpt-6-luna` aprobó la revisión de datos; tras corregir dos P2, la revisión dirigida aprobó. La validación en dispositivo físico de teclado móvil nativo y safe area no nula queda abierta. Fase 1 conserva QA visual independiente pendiente para la revisión integrada de Fase 5.
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

1. **Revisión técnica en ≤3 segundos:** con Jornada cargada, desde tocar la orden prioritaria hasta ver y revisar cliente, cuenta/medidor, dirección, deuda y estado. La medición de renderizado verifica solo la apertura; la comprensión humana aún requiere prueba de uso. No incluye descarga inicial ni autorización de corte.
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
| **3. Revisión de orden — cerrada** | Resumen de contexto de orden; mapa y datos secundarios en vistas separadas. | Evidencia en tres viewports. Tiempo de toque a vista estable medido; no equivale a comprensión humana. Fase revisada `PASS` por `gpt-6-luna`, commit `28f6bb4`. |
| **4. Captura segura sin scroll — revisada/cerrada para QA local** | Asistente compacto por pasos y borradores locales restaurables. | En browser: los siete pasos a 320×300 con teclado simulado tuvieron `scrollHeight=clientHeight=300`; cuerpo `scrollHeight=clientHeight=190`; CTA visible. A 320×568, 360×640 y 390×844, documento sin scroll. Teclado nativo y safe area no nula requieren validación física pendiente. |
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

**Estado actual:** Fases 2, 3 y 4 cerradas tras revisión con QA local disponible. Fase 4 corresponde a commits `adce142` y `f1772ca`; revisión de datos `gpt-6-luna` PASS, dos P2 corregidos y re-revisión dirigida PASS. La validación de teclado nativo y safe area no nula en dispositivo físico sigue abierta. Fase 1 conserva QA visual independiente pendiente para revisión integrada de Fase 5. Fase 5 es el siguiente paso.
**Evidencia Fase 2:** código asociado a commit `cbee456`. Suite previa: `npm test -- --run`, 17 archivos/143 pruebas; build aprobado. Tras último ajuste `aria-label` y `min-height:44`: UI 14/14 y build aprobados. No consta suite total posterior a ese ajuste. Revisión en browser local autenticado confirmó medidas de viewport indicadas arriba; no se guardaron capturas con datos personales en repo.
**Evidencia Fase 3:** summary muestra cinco datos; ausencia no se representa como cero. Órdenes canceladas y `PHYSICAL_UNKNOWN` bloquean. Reconexión aparece rotulada «Reconectada». Mapa sin coordenadas comunica ausencia; con coordenadas muestra un marcador de la orden. Actividad aparece condicionalmente. Datos secundarios muestran cuatro por página, textos largos paginados y nombre largo envuelto. A 320×568 caben siete órdenes. En 320×568, 360×640 y 390×844, summary tiene `scrollHeight=clientHeight` y acciones terminan antes del inicio de navegación. Datos1/2/Kardex caben sin scroll a 320×568; Kardex también en los otros dos tamaños. Toque en Jornada cargada hasta vista estable: 300/270/284 ms, respectivamente. Esta métrica no demuestra comprensión humana en ≤3 s. No se guardaron capturas con datos de clientes en el repositorio.

**Evidencia Fase 4:** pruebas reportadas: 166/166 y build aprobado. Incluyen preservación de siete stores al migrar v1→v2, borradores por alcance, restauración de `Blob`+`File`, fallo de escritura fail-closed, limpieza del borrador después de persistir registro/evidencia/cola y bloqueo ante autorización incierta. Browser: los siete pasos con teclado simulado a 320×300 mantuvieron documento en 300 px y cuerpo en 190 px, con CTA visible; a 320×568, 360×640 y 390×844 `scrollHeight=clientHeight`. La primera sesión IAB falló y se recuperó. No se envió ningún corte. Permanece un borrador dummy de QA en el browser local para la orden `a9587c65…a984`; no corresponde a una operación real. No se verificaron teclado nativo ni safe area no nula en dispositivo físico.

**Validación reportada:** Fase 3: suite 17 archivos/152 pruebas, build y `git diff --check` aprobados. Fase 4: 166/166 pruebas y build aprobados.

**Siguiente paso:** Fase 5, pulido Admin y recorrido integrado. Conservar como validación abierta el teclado nativo y safe area física. La meta de comprensión humana ≤3 s sigue sin demostrarse: las medidas existentes corresponden a apertura/renderizado únicamente.

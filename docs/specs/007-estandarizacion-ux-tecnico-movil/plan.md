# Plan 007: estandarización UX con prioridad en Técnico móvil

**Estado:** Fases 2 y 3 cerradas; Fase 3 recibió `PASS` de `gpt-6-luna`, commit `28f6bb4`. Fase 4 iniciada; almacenamiento de borradores en curso. QA visual independiente de Fase 1 queda pendiente para revisión integrada de Fase 5.

Este cambio armonizará el lenguaje visual de Administración y Técnico, priorizando el trabajo móvil del Técnico. Mantendrá las capacidades existentes, los datos y las reglas operativas; la referencia visual vigente es [`docs/design.md`](../../design.md).

## Ruta de trabajo

1. Ejecutar las cinco fases en orden, con requisitos, evidencia y controles de seguridad de `spec.md`.
2. En cada fase, reunir evidencia visual y funcional; `gpt-6-luna` revisa antes del avance.
3. Corregir hallazgos de fase y repetir revisión; no esperar aceptación del usuario.
4. El usuario puede inspeccionar cada entrega y comentar; su revisión no bloquea avance.

## Entrega anterior: Fase 1

Se normalizó la geometría de los estados de orden entre Admin y Técnico sin cambiar la paleta ni su significado. Se retiraron repeticiones dentro de las fichas y se oculta el estado de la fila Admin seleccionada mientras su ficha completa ya lo muestra.

La jerarquía, las superficies de panel y las acciones primarias ya reutilizan estilos comunes; se conservaron como base compartida en lugar de duplicar componentes o redefinir colores.

La búsqueda, selección individual y selección múltiple de Admin, junto con el recorrido y detalle técnico, se probaron sin confirmar creación ni asignación sobre los datos cargados. Por instrucción explícita del usuario se continúa con la Fase 2. No se registró una revisión visual independiente de Fase 1.

## Entrega cerrada: Fase 2

Jornada móvil ahora prioriza una orden con navegación anterior/siguiente y una acción principal para abrirla. El mapa y la cola tienen acceso directo en la navegación; actividad queda disponible como panel plegable. En Mis órdenes se muestra una por página en móvil y se mantienen búsqueda, filtros, navegación completa y datos financieros; escritorio conserva cinco por página. Las tarjetas de Jornada y de la bandeja reducen el contenido secundario en móvil sin borrar datos.

Browser local autenticado: Jornada y Mis órdenes sin scroll vertical a 320×568, 360×640 y 390×844 (`scrollHeight=clientHeight`). Filtros abiertos en popover 2×3 presentan las cinco opciones en 320 px, sin scroll horizontal/vertical de página; elegir opción cierra el popover. CTA y paginación permanecen visibles. `gpt-6-luna` encontró P2 de filtros; se corrigió y reviewer confirmó lo demás. No guardar capturas con datos personales en repo.

Validación: suite previa `npm test -- --run`, 17 archivos/143 pruebas; `npm run build` aprobado. Tras último cambio `aria-label` y `min-height:44`, UI 14/14 y build aprobados; suite total no repetida después de ese cambio. Evidencia de fase asociada a commit `cbee456`. No se cambiaron datos de negocio, backend, permisos ni reglas de corte. Detalle/captura quedan para fases posteriores.

## Entrega cerrada: Fase 3

Resumen muestra cinco datos prioritarios; datos ausentes no se convierten en cero. Cancelado y `PHYSICAL_UNKNOWN` bloquean. Reconexión usa rótulo «Reconectada». Mapa sin coordenadas señala ausencia; con coordenadas muestra un marcador de la orden. Actividad es condicional. Datos secundarios muestran cuatro por página; textos largos se paginan y nombre largo envuelve.

Browser a 320×568, 360×640 y 390×844: summary `scrollHeight=clientHeight`; acciones acaban antes de `navTop`. Siete órdenes caben a 320×568. Datos1/2/Kardex caben sin scroll a 320×568; Kardex también en 360×640 y 390×844. Toque desde Jornada cargada hasta vista estable tardó 300/270/284 ms, respectivamente. Esto mide apertura/renderizado; no acredita comprensión humana en ≤3 s. No se guardaron capturas con datos de clientes en repo.

Revisión `gpt-6-luna`: `PASS`. Commit: `28f6bb4`. Suite: 17 archivos/152 pruebas; build y `git diff --check` aprobados.

## Fases y aceptación

| Fase | Entrega y secuencia | Criterios visuales | Criterios funcionales y seguridad de datos |
|---|---|---|---|
| **1. Lenguaje visual compartido (Admin + Técnico)** | Aplicar patrones compartidos de jerarquía, botones, tarjetas y estados. | Evidencia de ambos roles; conserva paleta/estilo de `docs/design.md`; reduce estados repetidos sin ocultar información necesaria. | Flujo Admin conserva búsqueda, filtros, selección y asignación; Técnico mantiene sus acciones y estados. Comparar datos/capacidades antes y después; no se elimina ni sobrescribe información. Revisión `gpt-6-luna` antes de Fase 2. |
| **2. Jornada móvil y navegación acotada de órdenes — cerrada** | Jornada compacta prioriza una orden y permite recorrer todas. | Browser autenticado: sin scroll vertical en 320×568, 360×640, 390×844; filtros popover 2×3 con cinco opciones en 320 px; CTA/paginación visibles. | Suite previa 17 archivos/143 pruebas y build aprobados. Tras ajuste final `aria-label`/`min-height:44`, UI 14/14 y build aprobados; suite total no repetida. `gpt-6-luna` halló P2 de filtros, corregido; confirmó lo demás. |
| **3. Revisión compacta de orden — cerrada** | Resumen con cinco datos prioritarios; mapa y detalle separados. | Tres viewports verificados; resumen sin scroll. | Apertura estable 300/270/284 ms; mide renderizado, no comprensión humana ≤3 s. `gpt-6-luna` PASS, commit `28f6bb4`; suite 17 archivos/152 pruebas, build y diff check aprobados. |
| **4. Captura segura sin scroll y borradores locales durables — iniciada** | Pasos separados para lectura, GPS, evidencia, excepciones y revisión final; almacenamiento de borradores en curso. | Tres viewports en retrato, áreas seguras y teclado visible; verificar scroll y controles críticos. | IndexedDB aditivo, con claves estables existentes de técnico/dispositivo/orden/acción; local-only, fuera de cola de sync. Restaurar tras recarga. Ante error de escritura, permanecer en paso sin éxito falso. Retirar borrador solo después de persistir operación, evidencia y entrada de cola requerida. Autorización sigue online, concluyente, vigente y de un uso; incertidumbre bloquea. Verificar datos existentes. Revisión `gpt-6-luna` antes de Fase 5. |
| **5. Pulido Admin y recorrido integrado** | Pulido visual administrativo y revisión integrada entre roles. | Evidencia de Admin y recorrido técnico completo en viewports acordados; Técnico cumple criterio de scroll establecido. | Preservar filtros, selección múltiple entre páginas y asignación grupal. Medir confirmación ≤3 s solo con orden elegible visible y técnico seleccionado/conocido. Revisar conexión, sync, mapa y vistas secundarias. Confirmar persistencia, cola, autorización y datos previos. Revisión final `gpt-6-luna`. |

## Protocolo de revisión por fase

1. Dejar versión ejecutable; usar navegador y registrar escenarios, evidencia, tiempos medidos y defectos conocidos.
2. Revisar visual y funcionalmente con agente `gpt-6-luna`, incluidos integridad de datos y controles de seguridad aplicables.
3. Corregir defectos de fase actual y repetir revisión; no afirmar resultados no medidos.
4. Tras revisión satisfactoria, avanzar autónomamente a fase siguiente. Usuario puede inspeccionar cada entrega; aceptación no es gate.

## Riesgos y controles

| Riesgo | Control previsto |
|---|---|
| Viewport pequeño o teclado oculta contenido/acción | Verificar los tres tamaños, safe areas y teclado abierto en pasos de captura. |
| Simplificación oculta contexto, órdenes o capacidad Admin | Contrastar escenarios y capacidades existentes antes/después; recorrer páginas y selección cruzada. |
| Borrador se pierde, se sincroniza por error o se limpia antes de tiempo | Store IndexedDB aditivo; claves estables; comprobar restauración, aislamiento de cola y orden durable antes de retirar. |
| Error de persistencia parece éxito | Mantener paso actual, conservar memoria disponible, comunicar error y no avanzar. |
| Autorización incierta permite corte | Mantener autorización online concluyente, vigente y de un uso; incertidumbre bloquea. |
| Métrica de tres segundos se presenta sin medición válida | Registrar inicio/fin y precondiciones exactas de cada objetivo; no reportar estimación como resultado. |

## Límites

Sin cambios de paleta/estilo, reglas de negocio, estados de dominio, permisos, backend, API, contratos, modelo de dominio o significado de datos. Sin eliminar/sobrescribir datos o capacidades Admin. Sin relajación de autorización. No se incorporan métricas, funciones de negocio ni arquitectura adicional. Fase 1 mantiene QA visual independiente pendiente, que revisión integrada final podrá cubrir. Fase 3 cerrada; Fase 4 iniciada.

## Tareas

Desglose verificable: [`tasks.md`](tasks.md). Fuente de alcance: [`spec.md`](spec.md). Sistema visual: [`docs/design.md`](../../design.md).

# Tareas 007: estandarización UX con prioridad en Técnico móvil

**Estado:** Fase 2 en correcciones; `gpt-6-luna` revisa visual y funcionalmente antes de avanzar. Usuario puede inspeccionar cada entrega; aceptación no es gate. Fases 2–5 siguen sin marcarse completas.

Plan maestro: [`plan.md`](plan.md). Fuente de alcance: [`spec.md`](spec.md). Referencia visual: [`docs/design.md`](../../design.md).

Las casillas marcadas son trabajo completado; las pendientes siguen abiertas. Agente `gpt-6-luna` revisa visual y funcionalmente cada fase antes de avance autónomo. Usuario puede inspeccionar entregas; aceptación no es gate. Mantener las cinco fases, evidencia y controles de seguridad.

## Fase 1 — Lenguaje visual compartido (Admin + Técnico)

- [x] **1.1** Inventariar patrones de estado, jerarquía y acciones de Admin y Técnico frente a `docs/design.md`; conservar paleta, estilo y reglas.
- [x] **1.2** Reutilizar jerarquía, paneles y acciones primarias comunes; unificar la geometría de etiquetas de estado y reducir repeticiones. En Admin, la fila seleccionada cede el estado a la ficha abierta.
- [ ] **1.3** **QA visual final del usuario:** inspeccionar Admin y Técnico en el navegador y confirmar que la jerarquía, los estados y la paleta corresponden a lo esperado. La revisión preliminar del navegador fue a 300×649 CSS px; el contenedor no permitió validar 320×568, 360×640 y 390×844. No se guardan capturas con datos de clientes en el repositorio.
- [x] **1.4** **QA funcional:** Técnico recorrió orden siguiente/anterior y detalle. Admin probó búsqueda (28→11 coincidencias), filtro de área, selección individual y selección de dos suministros; se abrió y canceló el modal antes de confirmar creación/asignación. No se ejecutó ninguna operación de negocio sobre los datos cargados.
- [ ] **1.5** Reunir evidencia, resultados y defectos conocidos; revisión visual/funcional `gpt-6-luna`. Corregir hallazgos de esta fase antes de avanzar. Usuario puede inspeccionar entrega.

### Evidencia y límites de la Fase 1

- Los colores semánticos y la paleta existentes se conservaron; el cambio comparte tamaño, alineación, tipografía y radio de las etiquetas de estado entre roles y elimina etiquetas redundantes.
- Pruebas: `npm test -- --run` — 17 archivos, 142 pruebas aprobadas. `npm run build` — aprobado.
- Consulta PostgreSQL local en transacción de solo lectura: 7 órdenes, 7 asignadas y 0 sin asignar. No se confirmó ninguna escritura administrativa; los datos operativos permanecen intactos.
- La vista técnica actual aún desborda y requiere scroll en el viewport disponible; queda registrada para la fase de simplificación móvil. El usuario instruyó explícitamente continuar con Fase 2; no se registró una revisión visual independiente de Fase 1.

## Fase 2 — Técnico móvil: Jornada y navegación acotada

- [x] **2.1** Reordenar Jornada para priorizar una orden y una acción principal; conservar el acceso existente a mapa, sincronización, incidencias y detalle. La cola tiene acceso directo móvil; la actividad continúa disponible en su panel plegable.
- [x] **2.2** Acotar la navegación/paginación sin omitir ni reordenar órdenes; conservar búsqueda, filtros y cobertura total. La Jornada ordena por prioridad existente; Mis órdenes usa una tarjeta por página en móvil y cinco en escritorio.
- [ ] **2.3** **QA visual:** agente inspecciona Jornada con navegador en retrato 320×568, 360×640 y 390×844; comprobar safe areas, scroll/recortes, acción primaria y estado de conexión. `gpt-6-luna` revisa evidencia.
- [x] **2.4** **QA funcional automatizado:** 17 archivos/143 pruebas; se verifica prioridad, recorrido desde primera hasta última sin omitir órdenes, filtros/paginación y acceso offline con operación pendiente. Build de producción aprobado. No se modificaron datos persistentes del usuario.
- [ ] **2.5** Reunir evidencia visual/funcional y límites; `gpt-6-luna` revisa. Corregir hallazgos de Fase 2 antes de avanzar. Usuario puede inspeccionar entrega.

### Evidencia y límites de la Fase 2

- Jornada móvil tiene una acción principal «Abrir orden»; incidencias permanecen como acción secundaria y el mapa está disponible en navegación. La navegación «Pendientes» abre la cola y muestra indicador cuando hay operaciones pendientes; no se bloquea la operación local offline.
- En móvil la bandeja muestra una orden por página; escritorio mantiene cinco. La búsqueda, los filtros y la secuencia de órdenes se conservan.
- `npm test -- --run` — 17 archivos, 143 pruebas aprobadas. `npm run build` — aprobado. `git diff --check` — aprobado.
- **Pendiente:** correcciones de Fase 2 y revisión visual/funcional `gpt-6-luna` en 320×568, 360×640 y 390×844. No se adjuntan capturas ni se afirma ausencia de scroll medida.

## Fase 3 — Revisión compacta de orden

- [ ] **3.1** Implementar resumen con cliente, cuenta/medidor, dirección, deuda y estado; mostrar ausencias como ausencias, nunca inventar valores.
- [ ] **3.2** Separar mapa y detalle secundario del resumen; verificar que siguen accesibles y no desplazan datos prioritarios.
- [ ] **3.3** **QA visual:** inspeccionar/capturar resumen, mapa y detalle en 320×568, 360×640 y 390×844 retrato; documentar legibilidad conjunta de cinco datos, áreas seguras y ausencia de scroll/recortes.
- [ ] **3.4** **QA funcional y métrica:** desde Jornada cargada, medir toque en orden prioritaria hasta resumen estable con cinco datos, con datos locales; repetir casos de dato ausente. Registrar punto inicial/final y resultado; umbral ≤3 segundos. No incluir autorización ni ejecución.
- [ ] **3.5** Reunir evidencia, medición y defectos conocidos; revisión `gpt-6-luna`, corregir hallazgos antes de avanzar. Usuario puede inspeccionar.

## Fase 4 — Captura segura sin scroll y borradores

- [ ] **4.1** Separar captura en pasos de lectura, GPS, evidencia, excepciones y revisión final; verificar controles/excepciones existentes y secuencia de dominio sin cambios.
- [ ] **4.2** Añadir persistencia de borradores en store IndexedDB aditivo, claves estables existentes de técnico/dispositivo/orden/acción; verificar apertura de datos previos y no modificación de stores/registros existentes.
- [ ] **4.3** Restaurar tras recarga/cierre campos, evidencia seleccionada o persistida y justificación aplicable; comprobar borrador local no aparece en cola de sincronización ni como operación completada.
- [ ] **4.4** Retirar borrador solo después de verificar persistencia durable de operación, evidencias y entrada de cola requerida; simular/revisar error de escritura y confirmar permanencia en paso, mensaje claro, sin falso éxito ni limpieza.
- [ ] **4.5** Confirmar autorización online concluyente, vigente y de un uso inmediatamente antes del corte; comprobar ausencia, rechazo, vencimiento, desconexión y resultado incierto bloquean corte.
- [ ] **4.6** **QA visual:** inspeccionar/capturar cada paso en retrato 320×568, 360×640 y 390×844 con safe areas; repetir captura con teclado visible. Registrar input, error de guardado, avance, controles críticos, scroll y recortes.
- [ ] **4.7** **QA funcional y seguridad de datos:** recorrer lectura/GPS/evidencia/excepciones/revisión; recargar y restaurar borrador, inspeccionar aislamiento de cola, ejercitar fallo de escritura y condiciones de autorización; comparar datos anteriores y verificar que no se perdió ni sobrescribió información.
- [ ] **4.8** Reunir capturas por paso, escenarios, evidencia de persistencia/cola/autorización y defectos conocidos; revisión `gpt-6-luna`, corregir hallazgos antes de avanzar. Usuario puede inspeccionar.

## Fase 5 — Pulido Admin y recorrido integrado

- [ ] **5.1** Armonizar visualmente Admin y completar revisión del recorrido de ambos roles; verificar contexto de orden, técnico, bloqueos y confirmación sin cambiar reglas.
- [ ] **5.2** **QA visual:** capturar Admin y recorrido Técnico en viewports técnicos 320×568, 360×640 y 390×844; registrar áreas seguras, ausencia de scroll técnico, coherencia visual y defectos.
- [ ] **5.3** **QA funcional Admin:** probar filtros, selección múltiple, selección conservada al cambiar página y asignación grupal; medir desde orden elegible visible y técnico ya seleccionado/conocido hasta confirmación; registrar tiempo/precondiciones y umbral ≤3 segundos.
- [ ] **5.4** **QA funcional integrada y datos:** recorrer resumen, mapa/detalle, captura, borrador, autorización, persistencia y sync; comprobar estados y datos previos, que operación/evidencia/cola sobreviven conforme al flujo y que autorización incierta bloquea.
- [ ] **5.5** Reunir evidencia visual y funcional, métricas con condiciones y defectos conocidos; revisión final `gpt-6-luna`. No reportar métricas sin medición. Usuario puede inspeccionar entrega.

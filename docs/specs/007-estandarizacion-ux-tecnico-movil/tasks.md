# Tareas 007: estandarización UX con prioridad en Técnico móvil

**Estado:** Fase 5 PASS para QA local y revisión dirigida. Teclado nativo y safe area no nula en dispositivo físico pendientes (4.9). Objetivos humanos ≤3 s no demostrados.

Plan maestro: [`plan.md`](plan.md). Fuente de alcance: [`spec.md`](spec.md). Referencia visual: [`docs/design.md`](../../design.md).

Las casillas marcadas son trabajo comprobado en QA local; las pendientes siguen abiertas. Fase 4 cerrada para QA local con data-layer review PASS. Validación física pendiente.

## Fase 1 — Lenguaje visual compartido (Admin + Técnico)

- [x] **1.1** Inventariar patrones de estado, jerarquía y acciones de Admin y Técnico frente a `docs/design.md`; conservar paleta, estilo y reglas.
- [x] **1.2** Reutilizar jerarquía, paneles y acciones primarias comunes; unificar la geometría de etiquetas de estado y reducir repeticiones. En Admin, la fila seleccionada cede el estado a la ficha abierta.
- [x] **1.3** **QA visual integrado:** Admin revisado a 320/360/390 px, sin overflow horizontal y con lenguaje/paleta compartidos; pantallas técnicas revisadas en los viewports anotados en Fase 5. No se guardan capturas con PII en repo.
- [x] **1.4** **QA funcional inicial:** Técnico recorrió orden siguiente/anterior y detalle. Admin probó búsqueda (28→11 coincidencias), filtro de área y selecciones; en esa sesión el modal se canceló sin escribir. La asignación única probada después está descrita en 5.3.
- [x] **1.5** Evidencia visual/funcional integrada de roles reunida en Fase 5; revisión dirigida consolidada PASS en 5.5.

### Evidencia y límites de la Fase 1

- Los colores semánticos y la paleta existentes se conservaron; el cambio comparte tamaño, alineación, tipografía y radio de las etiquetas de estado entre roles y elimina etiquetas redundantes.
- Pruebas: `npm test -- --run` — 17 archivos, 142 pruebas aprobadas. `npm run build` — aprobado.
- Consulta PostgreSQL local en transacción de solo lectura: 7 órdenes, 7 asignadas y 0 sin asignar. No se confirmó ninguna escritura administrativa; los datos operativos permanecen intactos.
- La vista técnica actual aún desborda y requiere scroll en el viewport disponible; queda registrada para la fase de simplificación móvil. El usuario instruyó explícitamente continuar con Fase 2; no se registró una revisión visual independiente de Fase 1.

## Fase 2 — Técnico móvil: Jornada y navegación acotada

- [x] **2.1** Reordenar Jornada para priorizar una orden y una acción principal; conservar el acceso existente a mapa, sincronización, incidencias y detalle. La cola tiene acceso directo móvil; la actividad continúa disponible en su panel plegable.
- [x] **2.2** Acotar la navegación/paginación sin omitir ni reordenar órdenes; conservar búsqueda, filtros y cobertura total. La Jornada ordena por prioridad existente; Mis órdenes usa una tarjeta por página en móvil y cinco en escritorio.
- [x] **2.3** **QA visual:** browser local autenticado. Jornada y Mis órdenes sin scroll vertical en retrato 320×568, 360×640 y 390×844 (`scrollHeight=clientHeight`). Filtros popover 2×3 muestran cinco opciones en 320 px, sin scroll horizontal/vertical de página; selección cierra popover. CTA y paginación visibles. `gpt-6-luna` encontró P2 de filtros, corregido; reviewer confirmó lo demás. No guardar capturas con datos personales en repo.
- [x] **2.4** **QA funcional automatizado:** 17 archivos/143 pruebas; se verifica prioridad, recorrido desde primera hasta última sin omitir órdenes, filtros/paginación y acceso offline con operación pendiente. Build de producción aprobado. No se modificaron datos persistentes del usuario.
- [x] **2.5** Reunir evidencia visual/funcional y límites; `gpt-6-luna` revisó, se corrigió hallazgo P2 y confirmó lo demás. Fase 2 cerrada; avanzar a Fase 3 sin gate humano.

### Evidencia y límites de la Fase 2

- Jornada móvil tiene una acción principal «Abrir orden»; incidencias permanecen como acción secundaria y el mapa está disponible en navegación. La navegación «Pendientes» abre la cola y muestra indicador cuando hay operaciones pendientes; no se bloquea la operación local offline.
- En móvil la bandeja muestra una orden por página; escritorio mantiene cinco. La búsqueda, los filtros y la secuencia de órdenes se conservan.
- `npm test -- --run` — 17 archivos, 143 pruebas aprobadas. `npm run build` — aprobado. `git diff --check` — aprobado.
- Evidencia asociada a commit `cbee456`. Suite previa: `npm test -- --run` — 17 archivos/143 pruebas; build aprobado. Tras cambio final `aria-label` y `min-height:44`: UI 14/14 y build aprobados; suite total no repetida tras ese cambio.

## Fase 3 — Revisión compacta de orden (cerrada)

- [x] **3.1** Resumen muestra cliente, cuenta/medidor, dirección, deuda y estado; ausencias no se convierten en cero.
- [x] **3.2** Mapa y detalles secundarios quedan separados y accesibles. Mapa sin coordenadas señala ausencia; con coordenadas muestra un marcador de la orden. Actividad es condicional.
- [x] **3.3** **QA visual:** a 320×568, 360×640 y 390×844, summary `scrollHeight=clientHeight` y acciones terminan antes de `navTop`. Siete órdenes caben a 320×568. Datos1/2/Kardex caben sin scroll a 320×568; Kardex también en los otros dos tamaños. Datos secundarios: cuatro por página; textos largos paginados; nombre largo envuelto. Sin capturas con datos de clientes en repo.
- [x] **3.4** **QA funcional y tiempo de apertura:** toque en orden prioritaria desde Jornada cargada hasta vista estable: 300/270/284 ms en los tres tamaños, respectivamente. Es tiempo de apertura/renderizado, no prueba de comprensión humana ≤3 s. Cancelado y `PHYSICAL_UNKNOWN` bloquean; reconexión rotulada «Reconectada».
- [x] **3.5** Evidencia reunida; revisión `gpt-6-luna` `PASS`; commit `28f6bb4`. Suite 17 archivos/152 pruebas, build y `git diff --check` aprobados.

## Fase 4 — Captura segura sin scroll y borradores

Fase revisada y cerrada para QA local disponible. Commits `adce142` (IndexedDB v2 aditivo y borradores scoped) y `f1772ca` (asistente compacto de captura). No se envió ningún corte. Un borrador dummy de QA permanece en browser local para orden `a9587c65…a984`; no es una operación real.

- [x] **4.1** Separar captura en pasos de lectura, GPS, evidencia, excepciones y revisión final; controles y secuencia de dominio conservados.
- [x] **4.2** Añadir persistencia de borradores en IndexedDB v2 aditivo; pruebas confirman migración v1→v2 y preservación de siete stores existentes.
- [x] **4.3** Pruebas cubren borradores scoped, restauración `Blob`+`File` y separación de la cola de sync.
- [x] **4.4** Pruebas cubren write fail-closed y limpieza solo tras persistir registro, evidencia y cola requerida.
- [x] **4.5** Pruebas confirman que autorización incierta bloquea. No se afirma validación física ni cobertura adicional no reportada.
- [x] **4.6** QA browser: siete pasos a 320×300 con teclado simulado: documento 300/300, cuerpo 190/190, CTA visible; en 320×568, 360×640 y 390×844 documento sin scroll.
- [x] **4.7** 166/166 pruebas y build aprobados; IAB inicial falló y se recuperó. Sin corte enviado. Borrador dummy permanece en browser local para `a9587c65…a984`; sin operación real.
- [x] **4.8** Data-layer review `gpt-6-luna` PASS; dos P2 corregidos y re-revisión dirigida PASS. Cierre para QA local disponible.
- [ ] **4.9 Validación física pendiente:** comprobar teclado móvil nativo y safe area no nula en dispositivo real; browser simulado no sustituye esta verificación.

## Fase 5 — Pulido Admin y recorrido integrado

- [x] **5.1** QA visual integrada de Admin/Técnico completada en escenarios locales descritos abajo; coherencia confirmada, sin cambios de reglas.
- [x] **5.2** **QA visual browser:** home/orders/map/queue/order-review y Admin según evidencia previa. Tras el fix de detalle de cola, navegador verificado a 320×568, 360×640 y 390×844: documento `scrollHeight=clientHeight`, panel `overflowY=auto`, paginación fuera del panel, «Volver» y navegación visibles; captura 320 legible. Cola base con nuevo botón a 320×568: 568/568 y tres botones visibles antes de navegación. Teclado nativo y safe area física no verificados; mantener 4.9 pendiente.
- [x] **5.3** **QA funcional Admin:** simulado aislado 5176, selección de dos suministros en dos páginas; modal mostró ambos y técnico. Creó/asignó exactamente UNO elegible (Pedro Huanca) a Camila; ficha, cuenta y deuda correctas. No se probó crear/asignar ambos como lote. Click final a estado estable: 375 ms; no acredita comprensión humana ≤3 s. Modal 320×300 permite alcanzar selector/CTA con scroll; Admin puede desplazarse.
- [x] **5.4** **QA de persistencia local y sync:** Técnico real, puerto 5175, sesión Jhonny: siete órdenes y una operación local sobrevivieron reload con backend apagado. El intento automático dejó `failed`, `uncertain=true`, `manualReview=false`. No se confirmó ni eliminó; «Verificar estado» no pulsado. Frontend post-fix: 17 archivos/177 pruebas y build aprobados. Backend: 16 pruebas aprobadas, una integración DB omitida por falta de `DATABASE_URL`, build aprobado. No afirmar procesamiento de servidor ni E2E con backend.
- [x] **5.5 PASS — QA local y revisión dirigida:** reviewer Luna inicial halló P2 de recorte de detalle de cola; writer corrigió scroll interno y cadenas; reviewer dirigido Luna dio PASS, sin otros P1/P2 obvios. Revisión de código sin navegador; el orquestador verificó visualmente luego los viewports y cola base indicados en 5.2. No equivale a QA en dispositivo físico. Objetivo humano ≤3 s y validación física 4.9 siguen pendientes.

### Límites QA integrado

- Admin fue simulado y aislado; creación/asignación probada fue una sola orden elegible.
- Backend apagado durante la prueba de Jhonny: operación persistió localmente; quedó `failed`, `uncertain=true`, `manualReview=false`. No se confirmó ni eliminó y no se pulsó «Verificar estado».
- La revisión visual del fix del detalle de cola fue en navegador; no hubo validación en dispositivo físico.
- Sin capturas con PII en repo.

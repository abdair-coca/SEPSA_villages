# Pendientes archivados: entrega documental SEPSA

> Archivado el 2026-10-13 desde `.dev/DocTask.md` y `.dev/DocPlan.md`. Lo ejecuta el modelo que sigue `.dev/PLAN.md`, que lo enlaza desde su final. Ninguna tarea de este archivo está cerrada.

**Estado al archivar:** F0 a F4 hechas (F4 pendiente de revisión del usuario). F5 a F8 pendientes.
**Fuente de la entrega:** `docs/entrega-sepsa/` es una copia fechada de las fuentes vigentes (D021). Si cambia una fuente, la entrega se actualiza en la misma tarea.
**Antes de tocar código:** resolver primero los conflictos de la sección Hallazgos (H-01 a H-03). Son decisiones del usuario, no del código.

---

## Pendientes

### Decisiones del usuario

- [ ] **U-01** Revisión de `docs/entrega-sepsa/10-plan-pruebas.md` (F4.R). Bloquea F5.
- [ ] **U-02** Tratamiento de los seeds `backend/sql/seeds/005_definitive_seed.sql` (28 filas de personas) y `006_replace-betanzos-20260923-jhonny.sql` (948 filas). D026 los deja pendientes. El JSON ya se retiró del repo, pero el historial de git lo conserva.
- [ ] **U-03** Duración de sesión: D025 (vigente, 7 días) frente a D-h de `PLAN.md` (14 h). Ver H-01.
- [ ] **U-04** Umbral de tres meses de la carga de morosos (P-01): sin confirmar.
- [ ] **U-05** Exportación a Word (F8): confirmar si se quiere y si se commitea. Por defecto, fuera del repo.

### Fase 5: resultados de pruebas (`docs/entrega-sepsa/11-resultados-pruebas.md`, aún no existe)

Ejecutar sobre el código del commit actual. Si antes cambia el código por `PLAN.md`, anotar ese commit en `11`.

- [ ] **F5.1** Entorno: `node -v` devuelve v22.x y PostgreSQL o Docker responde. Guardar las salidas en el scratchpad. Si falla, detenerse e informar; no inventar resultados.
- [ ] **F5.2** Backend: `npm ci`, `npm run db:migrate:test` y `npm test` con `DATABASE_URL` local. Registrar pasadas y fallidas. Confirmar además si la omisión de `sql/003_payment_observations.sql` en `backend/scripts/migrate-test-db.mjs` es intencional y si alguna prueba la necesita.
- [ ] **F5.3** Backend: `npm run build` y `JSON.parse` de `backend/openapi/pilot-provisional.openapi.json`.
- [ ] **F5.4** Field-app: `npm ci`, `npm test -- --run` y `npm run build`. Registrar el número de pruebas.
- [ ] **F5.5** Field-app: `npm run smoke:ui` y `npm run smoke:pwa` con registro oficial. Adelanto no oficial: `smoke:ui` pasó 17 de 17 el 2026-10-12 en una copia limpia de HEAD con `VITE_ENABLE_SIMULATION=true`. Esa evidencia no se reutiliza; hay que repetirla.
- [ ] **F5.6** Backend: `npm run e2e:browser`, con Chrome o Chromium en `CHROME_PATH`. Si no corre, registrar la causa.
- [ ] **F5.7** Registrar en `11` cada comando con fecha, commit, código de salida y conteos. Cada cifra debe coincidir con la salida guardada.
- [ ] **F5.8** Listar en `11` lo no ejecutado, con su causa.
- [ ] **F5 cierre** Commit `docs(entrega-sepsa): resultados de pruebas con fecha y commit`. Requiere U-01.

### Fase 6: seguridad y datos (`12` y `13`, no creados)

- [ ] **F6.1.1** `12`: medidas de seguridad, cada una con su fuente (`docs/api/pilot-contract.md`, `docs/ARCHITECTURE.md`).
- [ ] **F6.1.2** `12`: matriz de permisos con una fila por ruta de `backend/src/http/router.ts`. Los roles de cada fila se comprueban contra el controlador (`backend/src/controllers/`).
- [ ] **F6.1.3** `12`: perfiles ADMIN y TECHNICIAN, grants y cambio de rol, citando `ARCHITECTURE.md` ("Identidad y autorización") y `pilot-contract.md`.
- [ ] **F6.1.4** `14`: pendientes de seguridad: TLS, rotación de secretos, rate limit distribuido, revocación por dispositivo y backup cifrado.
- [ ] **F6.2.1** `13`: inventario por almacén. Cada store de `field-app/src/adapters/indexeddb/database.ts` y cada tabla de `04` deben aparecer, junto con logs y evidencia.
- [ ] **F6.2.2** `13`: marcar los datos personales (nombre, dirección, medidor, deuda, fotos) con su ubicación.
- [ ] **F6.2.3** `13`: qué borra el cierre de sesión (`session-persistence.ts`, `store-actions.ts`, `runtime.ts`). Si no borra datos de trabajo locales, se documenta como pendiente, no como garantía.
- [ ] **F6.2.4** Retención y eliminación: `TODO: VALIDAR CON SEPSA` en `13` y listados en `14`.
- [ ] **F6 cierre** Commit `docs(entrega-sepsa): seguridad, perfiles de acceso y tratamiento de la información`.

### Fase 7: cierre

- [ ] **F7.1** Enlaces relativos de `docs/entrega-sepsa/*.md` apuntan a archivos existentes. Hoy falta `11-resultados-pruebas.md` hasta F5.
- [ ] **F7.2** Los `TODO: VALIDAR CON SEPSA` de la entrega tienen entrada en `14`, y cada entrada tiene su fuente.
- [ ] **F7.3** `AGENTS.md`: fila para `docs/entrega-sepsa/` en la tabla de routing.
- [ ] **F7.4** `docs/PROJECT.md`: la entrega en "Documentos activos".
- [ ] **F7.5** Las fechas `Fecha:` son iguales o posteriores a la última modificación de cada fuente.
- [ ] **F7.6** `.dev/DocPlan.md` y `.dev/DocTask.md` marcados como terminados. No se commitean.
- [ ] **F7 cierre** Commit `docs(entrega-sepsa): cierre de la entrega y routing`.

### Fase 8: Word

- [ ] **F2.2.3** Renderizar el diagrama ER de `04` (Mermaid) y validar su sintaxis. Se hace al exportar.
- [ ] **F8.1** `.docx` con el índice y los 14 documentos, con la skill de Word. Debe abrir, con 14 títulos de nivel 1 más el índice.
- [ ] **F8.2** La tabla de contenido coincide con el índice de `docs/entrega-sepsa/README.md`.
- [ ] **F8.3** Entregar el archivo con `SendUserFile`. Sin commit, salvo petición.

---

## Hallazgos

Conflictos entre `.dev/PLAN.md` y decisiones o código vigentes. Resolver antes de ejecutar la tarea de PLAN indicada.

- **H-01 Sesión: 14 h frente a 7 días (conflicto).** `PLAN.md` (decisión D-h y tarea 2.4) fija `SESSION_TTL_SECONDS` = 50400 (14 h). D025, vigente, fija 604800 (7 días) en `render.yaml` y `backend/.env.example`, y la pantalla de acceso dice «La sesión dura 7 días». Ejecutar 2.4 tal cual revierte D025. Antes de tocar `render.yaml` hay que decidir: actualizar D025 con una decisión nueva, o cambiar la tarea. Este conflicto es U-03.
- **H-02 Carga de datos al arrancar (conflicto).** La tarea 0.2 pide que el arranque ejecute la carga del Excel y que un segundo arranque no cambie tablas. D026, vigente (commit `d8f1d0d`), quita la carga del `CMD`: solo se ejecuta a mano con `npm run pilot:migrate:field-test`, y el archivo de datos ya no está en el repo. Las aceptaciones de 0.2 hay que reescribirlas contra D026. El umbral de tres meses sigue sin confirmar (U-04).
- **H-03 Datos personales en el repo (conflicto).** La tarea 4.2 afirma que «el Excel no contiene datos reales (confirmado por el usuario)». Eso se refiere al Excel. Los seeds `005_definitive_seed.sql` (28 filas) y `006_replace-betanzos-20260923-jhonny.sql` (948 filas) contienen filas de personas (D026). No se puede afirmar en la entrega que el repo no tiene datos personales hasta resolver U-02. La tarea 0.1 también cita `005_definitive_seed.sql`, que sí existe.
- **H-04 Guía de campo.** La tarea 3.5 pide revisar `guia-tecnico-campo-piloto.pdf`. Ese PDF se retiró. La guía vigente es `docs/operations/guia-de-campo.md`, verificada contra las etiquetas de la aplicación. Revisar esa guía.
- **H-05 Contrato incompleto.** `docs/api/pilot-contract.md` no documenta `GET /v1/admin/reconciliation`, que ya existe y tiene prueba en `backend/test/cut-consume.integration.test.ts`. Tampoco documenta el estado `rejected` de la consulta de habilitación, que la tarea 1.3 añade. Hay que actualizar contrato y OpenAPI en la tarea 1.3 e incluir el endpoint existente.
- **H-06 `pilot:bootstrap`.** El script aplica más scripts de los que indica `backend/README.md`. Decidir si el README o el script es la fuente y corregir el otro.
- **H-07 Cobertura de pruebas (de `10`, secciones 7 y 9).** Cada hueco se puede cubrir con la tarea de PLAN que toca ese código:
  - RF-19: el valor de 15 s de `CONSUME_TIMEOUT_MS` (`field-app/src/adapters/http/client.ts`) no tiene prueba que lo fije. La tarea 1.2 la cubre si añade esa aserción.
  - RF-16: el límite de 1 000 000 bytes no aparece como literal en las pruebas. La tarea 0.8 añade una prueba de tamaño objetivo.
  - RF-14: no hay prueba de lectura negativa ni de unidad distinta de kWh.
  - RF-10: la conservación del conflicto en el backend no tiene prueba propia.
  - RF-22: los umbrales de validación de la captura de corte no están confirmados y no tienen prueba.
  - RF-33: no hay prueba de que las transiciones sean append-only.
  - RF-35: no hay prueba de 403 para técnico en `/v1/audit`.
  - RF-09 y RF-27: sin cobertura. RF-09 no está implementado; RF-27 depende de la regla pendiente de cargos.
  - Borrado de datos locales al cerrar sesión: sin prueba de los datos de trabajo (ver F6.2.3).
- **H-08 `test:smoke-guard` fuera del CI.** `field-app/scripts/smoke-build.test.mjs` protege el build simulado que usan `smoke:ui` y `smoke:pwa`. No corre en el job `field-app` de `.github/workflows/ci.yml`. La tarea 2.1 cambia ese build, así que conviene añadirlo al job en la misma tarea.
- **H-09 Numeración de decisiones.** `PLAN.md` usa códigos D-a a D-i y dice que los D0XX son orientativos. `docs/DECISIONS.md` ya tiene D019 a D026. Las decisiones nuevas empiezan en D027, y cada tarea debe citar el número real.
- **H-10 Entrega y PLAN.** Las tareas 3.4, 3.5, 4.1 y 4.4 dicen que la entrega cubre el tema y que debe reflejar D019 a D024. Además debe reflejar D025 y D026, y los cambios de 0.8, 1.1 a 1.4, 2.1, 2.4 y 2.5 cuando se implementen. Por D021, cada cambio de código actualiza en la misma tarea los documentos de `docs/entrega-sepsa/` afectados: `01`, `02`, `03`, `07`, `08`, `09`, `10`, `11`, `12` y `14`.

---

## Notas para quien ejecute `PLAN.md`

- Commits: uno por tarea, en `main`, sin push (`AGENTS.md`). Mensaje en español con `type(scope): resumen`, y citar las decisiones afectadas.
- No commitear `.dev/PLAN.md`, `.dev/DocPlan.md`, `.dev/DocTask.md` ni `.claude/skills/redesign-existing-projects/SKILL.md`.
- Cuando se cierre un pendiente, marcarlo `[x]` aquí y citar el commit.

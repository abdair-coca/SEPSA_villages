# Tareas 008 — Auditoría controlada del frontend

La etapa 1 está documentada en [`docs/audits/008-frontend.md`](../../audits/008-frontend.md). El usuario autorizó completar todos los hallazgos del frontend. H-01 y H-02 están implementados y documentados; H-07 y H-11 están implementados y documentados en [`docs/audits/008-frontend-stage2-map.md`](../../audits/008-frontend-stage2-map.md). H-03, H-04, H-05, H-06, H-08 y H-10 están implementados y documentados en [`docs/audits/008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md). H-09 permanece pendiente porque requiere backend/despliegue, fuera de alcance. La discrepancia de auto-sync reportada por el usuario permanece registrada; la aceptación final aún requiere confirmación explícita.

## Etapa 1 — Auditoría y aprobación

- [x] **1.1** Registrar estado inicial, incluidos cambios locales previos, e inventariar todas las áreas de `field-app` en una matriz de cobertura.
- [x] **1.2** Revalidar `npm test -- --run` y `npm run build`; guardar resultados, versiones y fallos.
- [x] **1.3** Medir tamaños generados de JavaScript y CSS, describir método y compararlos con la referencia reportada (468.57 kB y 207.59 kB, sin gzip).
- [x] **1.4** Inventariar dependencias, duplicación y composición; buscar consumidores y efectos de cada candidato a código sin uso.
- [x] **1.5** Revisar vistas a 1440 px y 320×568, 360×640 y 390×844 px; documentar evidencia visual anonimizada de ambos roles. La inspección y medidas están documentadas; no se conservaron capturas persistentes.
- [x] **1.6** Recorrer escenarios offline, sincronización, autenticación y solo lectura; registrar estado inicial, acciones y resultado observado. Los recorridos offline/sync fueron pruebas automatizadas; el smoke de navegador no llegó a desconexión, límite H-01.
- [x] **1.7** Evaluar accesibilidad, seguridad del frontend y rendimiento con comprobaciones y métricas repetibles; anotar límites.
- [x] **1.8** Redactar `docs/audits/008-frontend.md`; incluir matriz de cobertura, diferencia de headers y hallazgos con `ruta:línea`, severidad, impacto, prueba/evidencia y propuesta.
- [x] **1.9** Revisar integridad del informe: cobertura de todo `field-app`, hallazgos reproducibles, incertidumbres identificadas y ningún cambio productivo durante la etapa.
- [x] **1.10** Entregar comandos, evidencia y pasos de comprobación del informe; registrar aprobación explícita por hallazgo como condición de entrada a etapa 2. El usuario aprobó después H-01 a H-10 para la fase frontend.

## Etapa 2 — Implementación aprobada y aceptación

- [x] **H-01** Ajuste unitario de auto-sincronización implementado; la reproducción de navegador reportada permanece pendiente; evidencia en [`008-frontend-stage2-h01.md`](../../audits/008-frontend-stage2-h01.md).
- [x] **H-02** Composición compartida del header; evidencia en [`008-frontend-stage2-h02.md`](../../audits/008-frontend-stage2-h02.md).
- [x] **H-03** Consolidación de cascada CSS sin cambiar estilos; evidencia en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md).
- [x] **H-04** Ciclo completo de foco del diálogo fullscreen del mapa; evidencia en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md).
- [x] **H-05** Semántica accesible de la campana administrativa; evidencia en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md).
- [x] **H-06** Eliminación del icono sin consumidor demostrado; evidencia en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md).
- [x] **H-07** Tipado explícito de Leaflet; evidencia en [`008-frontend-stage2-map.md`](../../audits/008-frontend-stage2-map.md).
- [x] **H-08** Precondición y comprobación del modo simulado de build/smoke; evidencia en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md).
- [ ] **H-09** Ajuste de despliegue/origen; backend fuera de alcance.
- [x] **H-10** Pruebas visuales y semánticas adicionales; evidencia en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md).
- [x] **H-11** Seguridad del contenido dinámico del popup; evidencia en [`008-frontend-stage2-map.md`](../../audits/008-frontend-stage2-map.md).

- [x] **2.1** Crear lista trazable de cambios aprobados y preservar decisiones abiertas como pendientes. Alcance autorizado: H-01 a H-10 en frontend; H-09 queda condicionado por evidencia de producción y backend fuera de alcance.
- [x] **2.2** Si se aprueba el hallazgo, estructurar header común para marca, título, contexto y acciones por rol; mantener permisos, identidad visual y tareas específicas de cada rol. Implementado para H-02.
- [x] **2.3** Reusar composición duplicada aprobada cuando mejore mantenimiento sin cambiar semántica o comportamiento. Se mantiene `AppHeader` como composición común y se eliminó solo CSS efectivamente redundante.
- [x] **2.4** Añadir comentarios únicamente para decisiones complejas aprobadas que no se entiendan del código. La fase no requirió comentarios no evidentes adicionales.
- [x] **2.5** Eliminar únicamente código sin uso demostrado mediante búsqueda de referencias, puntos de entrada y efectos. Se retiró `IconPhone` tras búsqueda global sin consumidores.
- [x] **2.6** Optimizar cuellos medidos y aprobados; añadir pruebas focalizadas para proteger comportamiento afectado. Se añadieron pruebas de header, popup, foco y guard de smoke; no se alteraron coordenadas ni estilos visuales.
- [x] **2.7** Repetir pruebas, build, tamaños, mediciones y recorridos equivalentes; comparar vistas 1440 px y 320×568/360×640/390×844 px. La evidencia de esta fase está en [`008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md); la discrepancia de auto-sync reportada permanece registrada aunque el smoke simulado de esta ejecución pasó.
- [x] **2.8** Confirmar preservación de reglas, permisos, datos, contratos, IndexedDB, cola, autorización y flujos offline. La suite (190 pruebas), build y smoke pasan; no se modificaron esos límites. Esto no cierra la discrepancia de auto-sync reportada ni H-09.
- [ ] **2.9** Entregar comparación antes/después, evidencia, límites y pasos de prueba de Admin/Técnico al usuario; obtener aceptación explícita antes de proponer backend.

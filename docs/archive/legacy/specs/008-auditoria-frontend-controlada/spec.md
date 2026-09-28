# Spec 008 — Auditoría controlada del frontend

**Estado:** etapa 1 auditada; etapa 2 autorizada para todos los hallazgos del frontend. H-01 y H-02 están implementados y documentados; H-07 y H-11 están implementados y documentados en [`docs/audits/008-frontend-stage2-map.md`](../../audits/008-frontend-stage2-map.md); H-03, H-04, H-05, H-06, H-08 y H-10 están implementados y documentados en [`docs/audits/008-frontend-stage2-phase2.md`](../../audits/008-frontend-stage2-phase2.md). H-09 se diagnosticó como rechazo de origen, pero su ajuste de despliegue no amplía el alcance al backend. La discrepancia de auto-sync reportada permanece registrada y la aceptación final está pendiente.
**Alcance:** `field-app`; dos etapas con aprobación explícita entre ellas. Ningún hallazgo se considera aprobado por su inclusión en el informe.

## Resultado esperado

Obtener primero un diagnóstico reproducible de todo el frontend y sus riesgos. Solo después de que el usuario revise los hallazgos y autorice la segunda etapa se implementarán los cambios aprobados. Al cerrar esa etapa, el usuario revisará el resultado antes de iniciar un cambio separado de backend.

Se conservan la lógica de negocio, permisos, datos, contratos, persistencia IndexedDB, cola de sincronización y autorización. Se conserva el lenguaje visual de [`docs/design.md`](../../design.md); el header compartido podrá estandarizar su composición entre roles sin uniformar sus flujos operativos.

## Requisitos y escenarios

### Etapa 1: auditoría sin cambios productivos

- **R1 — Cobertura:** inventariar todo `field-app` y registrar en una matriz qué áreas se inspeccionaron (`ui`, `app`, `application`, `domain`, `ports`, `adapters`, PWA y configuración/pruebas), con sus límites. Examinar dependencias, composición, duplicación y código aparentemente sin uso. La eliminación solo podrá proponerse con evidencia de que el código no se usa.
- **R2 — Línea base:** volver a ejecutar `npm test -- --run` y `npm run build`; registrar versiones, resultado, tamaño de JavaScript y CSS generado. Comparar medidas solo bajo condiciones equivalentes y anotar límites, incluida compresión si no se mide.
- **R3 — Experiencia:** revisar vistas y recorridos en 1440 px y en Android de 320×568, 360×640 y 390×844 px. Cubrir estado offline, sincronización, autenticación y acceso de solo lectura en entorno local simulado o con datos de prueba aislados, sin realizar cortes físicos ni usar datos personales en capturas.
- **R4 — Calidad:** revisar accesibilidad, seguridad del frontend y rendimiento con métricas reproducibles. Separar mediciones de observaciones; no afirmar causalidad sin evidencia.
- **R5 — Informe:** producir `docs/audits/008-frontend.md` con matriz de cobertura, línea base y hallazgos identificados de forma estable. Cada hallazgo incluirá evidencia `ruta:línea`, severidad, impacto, comprobación/prueba y propuesta. Clasificar duplicación y candidato a código sin uso, con evidencia y confianza; evaluar explícitamente la diferencia entre los headers de ambos roles.
- **R6 — Aprobación:** cerrar etapa 1 con informe revisable, límites y preguntas abiertas. No cambiar código productivo ni comenzar refactor hasta que el usuario apruebe explícitamente el alcance de etapa 2.

**Escenario — auditoría:** Dado el frontend en su estado inicial, cuando se complete la etapa 1, entonces el usuario puede localizar cada hallazgo en el informe, repetir los comandos documentados, revisar la matriz y aprobar o rechazar propuestas individualmente, mientras el código productivo permanece intacto respecto al estado inicial registrado.

### Etapa 2: implementación aprobada

- **R7 — Alcance aprobado:** implementar únicamente hallazgos que el usuario haya aprobado tras leer el informe. Registrar exclusiones y decisiones pendientes sin resolverlas por suposición.
- **R8 — Composición común:** si el hallazgo del header queda aprobado, comenzar por estructurarlo entre roles —marca, título, contexto y acciones según rol—, preservando permisos y diferencias operativas.
- **R9 — Reuso y comentarios:** consolidar composición duplicada cuando reduzca mantenimiento sin ocultar diferencias de dominio. Añadir comentarios solo para decisiones complejas que no sean evidentes en el código.
- **R10 — Código sin uso y optimización:** eliminar código solo tras demostrar que no tiene consumidores ni efectos requeridos; optimizar cuellos de botella medidos en etapa 1.
- **R11 — Integridad visual y funcional:** mantener paleta, tipografía, patrones, distribución operativa por rol y comportamiento de negocio. Añadir pruebas focalizadas cuando protejan el comportamiento afectado.
- **R12 — Comparación y cierre:** repetir mediciones y recorridos comparables con la línea base; documentar resultados antes/después, pruebas, límites y pasos para que el usuario pruebe ambos roles. Solicitar aceptación explícita del frontend antes de planificar backend en otro cambio.

**Escenario — implementación:** Dado un informe revisado y un conjunto explícito de hallazgos aprobados, cuando termine la etapa 2, entonces cada cambio se vincula a un hallazgo aprobado, las métricas y verificaciones comparables quedan documentadas y el usuario puede aceptar o pedir ajustes antes de abordar backend.

## Línea base conocida, pendiente de revalidación

El 2026-09-27 se reportó para `field-app`: `npm test -- --run` pasó con 17 archivos y 182 pruebas; `npm run build` pasó; JavaScript principal 468.57 kB y CSS principal 207.59 kB sin gzip. Son referencias iniciales, no conclusiones de auditoría. La etapa 1 debe repetirlas desde el estado que encuentre y explicar cualquier diferencia.

## Fuera de alcance

Cambios de backend, dominio, reglas, permisos, contratos, datos persistidos o sincronización. Refactor antes de aprobación de etapa 1. Rediseño visual que cambie identidad o flujos por rol. Métricas no reproducibles o supuestos sobre uso de código.

## Referencias

Constitución: [`docs/constitution.md`](../../constitution.md). Sistema visual: [`docs/design.md`](../../design.md). La aceptación explícita aquí definida prevalece para este cambio sobre la progresión automática descrita en Spec 007.

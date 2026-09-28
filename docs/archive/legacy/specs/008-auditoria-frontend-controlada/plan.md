# Plan 008 — Auditoría controlada del frontend

La ejecución tiene exactamente dos etapas. Etapa 1 entregó evidencia en [`docs/audits/008-frontend.md`](../../audits/008-frontend.md); etapa 2 comienza solo con aprobación explícita del usuario y cubre solo hallazgos aprobados. El informe no autoriza implementar por sí mismo.

## Etapa 1 — Auditoría y decisión

1. Registrar el estado inicial del repositorio y el alcance completo de `field-app`; identificar versiones, scripts y herramientas existentes.
2. Levantar línea base reproducible: `npm test -- --run`, `npm run build`, tamaños de JS/CSS producidos y condiciones de medición. Anotar fallos y limitaciones sin corregir código.
3. Recorrer arquitectura UI, dependencias, composición repetida y usos de los candidatos a código sin uso. Seguir referencias y puntos de entrada antes de clasificarlos.
4. Inspeccionar escritorio a 1440 px y Android a 320×568, 360×640 y 390×844 px; comprobar recorridos y estados offline, sync, autenticación y solo lectura con datos de prueba aislados.
5. Examinar accesibilidad, seguridad en cliente y rendimiento; asociar cada observación con artefacto, pasos y medida reproducible cuando corresponda.
6. Escribir `docs/audits/008-frontend.md` con hallazgos priorizados y sus pruebas. Distinguir defecto confirmado, riesgo, oportunidad y pregunta pendiente.
7. Presentar informe, comandos y límites al usuario. Esperar su revisión y autorización explícita para etapa 2; el usuario define qué hallazgos se aprueban.

**Salida y puerta:** informe completo, resultados que otra persona puede repetir y cero cambios productivos atribuibles a auditoría. Sin aprobación, el cambio termina aquí.

**Cómo valida el usuario:** desde `field-app`, repetir `npm test -- --run` y `npm run build`; contrastar los resultados y tamaños con el informe, abrir los enlaces `ruta:línea` de los hallazgos prioritarios y revisar la matriz de cobertura y evidencia visual anonimizada. El informe mostrará el estado inicial del repositorio para distinguir cambios previos de cambios de auditoría. El usuario aprobará o rechazará cada cambio propuesto antes de la etapa 2.

## Etapa 2 — Cambios aprobados y validación

1. Convertir únicamente los hallazgos aprobados en una lista de cambios trazables; resolver bloqueos de requisitos antes de tocar comportamiento.
2. Si se aprueba, establecer el header compartido como primer cambio estructural: marca, título, contexto y acciones provistas según rol. Mantener identidad y composición operativa propias de cada rol.
3. Reusar módulos donde reduzca duplicación real sin forzar abstracciones ni mezclar responsabilidades.
4. Añadir comentarios solo donde expliquen una decisión compleja. Quitar código únicamente cuando referencias, puntos de entrada y efectos demuestren que no se usa.
5. Optimizar solo problemas respaldados por mediciones de etapa 1. Proteger cambios funcionales con pruebas focalizadas.
6. Repetir pruebas, build, tamaños, métricas y recorridos bajo condiciones comparables. Revisar visualmente 1440 px y 320×568/360×640/390×844 px; contrastar los flujos offline, sync, autenticación y solo lectura.
7. Entregar informe before/after, lista de hallazgos tratados, no tratados y pasos reproducibles para la revisión del usuario. Esperar aceptación explícita del frontend; backend será un cambio posterior independiente.

**Salida y puerta:** cambios limitados a lo aprobado, comportamiento preservado y comparación verificable. La aceptación del usuario cierra frontend y habilita decidir el cambio posterior de backend.

**Cómo valida el usuario:** repetir los comandos y mediciones de etapa 1; abrir Administración y Técnico en escritorio y móvil de prueba, comprobar la estructura común del header si fue aprobada y las acciones propias de cada rol, búsqueda/selección administrativa y acceso del Técnico a órdenes offline y cola persistente tras recarga. Usar datos de prueba aislados y no ejecutar un corte físico. La entrega incluirá resultados esperados y observados para cada paso, además de cualquier limitación.

## Medición y evidencia

- Capturar salida completa de comandos, versiones y artefactos de build; reportar tamaños con unidad y método. Si gzip no se mide, rotular tamaños como sin gzip.
- Para rendimiento, fijar herramienta, dispositivo/entorno, viewport, estado de caché y recorrido; reportar repeticiones y valores observados. No comparar condiciones distintas como si fueran equivalentes.
- Registrar tamaños visuales exactos. No incluir datos personales en capturas ni en el informe.
- Cada observación de código apunta a `ruta:línea` del estado revisado; actualizar referencias al implementar si las líneas cambian.

## Referencias

Alcance: [`spec.md`](spec.md). Desglose: [`tasks.md`](tasks.md). Constitución: [`docs/constitution.md`](../../constitution.md). Lenguaje visual: [`docs/design.md`](../../design.md).

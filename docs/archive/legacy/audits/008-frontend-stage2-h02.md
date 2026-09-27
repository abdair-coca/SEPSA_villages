# Etapa 2, H-02 — Header compartido (para aceptación)

**Alcance autorizado:** únicamente H-02 de [`008-frontend.md`](008-frontend.md), tras la petición del usuario de arreglar el header y su indicación de continuar. H-01 y H-03 a H-10 no se implementaron. No se modificaron reglas de negocio, permisos, contratos, persistencia, sincronización, backend ni CSS.

## Cambio

`field-app/src/ui/AppHeader.tsx` concentra marca, identidad, título, contexto y salida de Admin y Técnico en un módulo con variantes de rol. `FieldApp.tsx` y `OperationsApp.tsx` lo consumen. `AppHeader.test.tsx` cubre contenido, estructura y controles renderizados en ambas variantes. Se mantuvieron clases, texto y disposición DOM de cada experiencia; esto estandariza la composición del código **sin homogeneizar visualmente** dos flujos con necesidades distintas. No se añadieron comentarios triviales ni se eliminaron elementos ajenos a H-02.

## Antes y después

| Comprobación | Antes (etapa 1) | Después de H-02 |
| --- | --- | --- |
| Pruebas | 17 archivos, 182 pruebas | 18 archivos, 184 pruebas; todas pasan con un worker |
| Build | Pasa, 76 módulos | Pasa, 77 módulos |
| JS principal simulado, sin gzip | 468 547 B | 468 640 B (+93 B); gzip 132.24/132.26 kB aproximadamente |
| CSS principal, sin gzip | 207 587 B | 207 587 B (sin cambio) |
| Estructura Admin | `.admin-topbar` más `.operations-header` | Igual, renderizada desde `AppHeader` |
| Estructura Técnico | `<header class="app-header">` | Igual, renderizada desde `AppHeader` |

Método de tamaño: longitudes de archivos `dist/assets` tras build de producción con `VITE_PILOT_BACKEND_URL` vacío **solo para el proceso**. Las cifras gzip provienen de Vite. El build con la configuración local normal también pasó (JS principal 468.66 kB y CSS 207.59 kB según Vite), pero no se compara como optimización porque incluye otra URL. Los 93 B no constituyen mejora de rendimiento; H-02 es mantenimiento estructural.

Se midieron `innerWidth`, `innerHeight`, `document.documentElement.scrollWidth`, altura del header, tamaño del título y presencia de salida en navegador local simulado. Las dimensiones comprobadas fueron 320×568, 360×640, 390×844 y 1440×900 en **ambos roles**. Los anchos de documento y alturas de cabecera resultaron idénticos a la línea base en las ocho combinaciones; ningún ancho de documento excedió el viewport. En Admin, la barra midió 143.6 px en móvil y 64.8 px en escritorio, y el bloque del título 164/108 px, igual que antes. En Técnico, el header midió 172, 152, 186 y 160.8 px respectivamente, también igual que antes. La captura de Admin a 320 px no mostró desplazamiento visual; la herramienta de captura no pudo producir la captura posterior de Técnico, aunque sí se comprobaron DOM, accesibilidad y dimensiones. No se guardaron imágenes persistentes.

## Pruebas ejecutadas

- `npm test -- --run src/ui/AppHeader.test.tsx src/ui/FieldApp.test.tsx src/ui/OperationsApp.test.tsx`: **3 archivos, 54 pruebas, pasa**.
- `npm test -- --run`: falló por agotamiento de memoria del equipo al iniciar múltiples workers (`Fatal process out of memory`, `spawn ENOMEM`), antes de completar la suite. No se observó aserción fallida. `npm test -- --run --maxWorkers=1 --no-file-parallelism`: **18 archivos, 184 pruebas, pasa**.
- `$env:VITE_PILOT_BACKEND_URL = ''; npm run build`: **pasa** (`tsc --noEmit` y Vite). Compilación normal con la configuración local existente: **pasa**.
- `git diff --check`: **pasa**. Los avisos LF/CRLF corresponden también a archivos previamente modificados, no a errores de espacios.
- Navegador local: Admin y Técnico inician sesión en modo simulado; títulos, identidad y salida aparecen en los cuatro tamaños. Se comprobó salida al cambiar de rol; no se ejecutaron cortes ni cambios físicos.

## Cómo probar H-02

1. Desde `field-app`, ejecutar `npm test -- --run --maxWorkers=1 --no-file-parallelism` y `npm run build`. Usar un solo worker si hay poca memoria disponible.
2. Para prueba aislada sin backend local, construir con `VITE_PILOT_BACKEND_URL` vacío y ejecutar `npm run preview -- --host 127.0.0.1 --port 4183`. En PowerShell, la asignación temporal es `$env:VITE_PILOT_BACKEND_URL = ''; npm run build`.
3. Abrir `http://127.0.0.1:4183/` con identidades simuladas del proyecto. En Admin, comprobar marca, identidad, título y **Cerrar sesión**; en Técnico, comprobar técnico/dispositivo, estado de red, última actualización, acciones de envío y **Cerrar sesión**.
4. Repetir en 320×568, 360×640, 390×844 y 1440×900. Resultado esperado: mismo aspecto previo por rol y ningún desbordamiento nuevo. Los headers de ambos roles **no se vuelven visualmente idénticos**: eso cambiaría el estilo y no forma parte de H-02 aprobado.

## Límites y decisión pendiente

El smoke PWA de navegador continúa fallando antes del tramo offline por H-01, no aprobado en esta ejecución. El 403 de producción sigue sin diagnóstico de backend. Las pruebas de esta tarea protegen estructura renderizada; no sustituyen una revisión humana de cada control en dispositivos reales.

**Aceptación solicitada:** confirmar si la composición común de H-02 y la conservación del aspecto de ambos roles son satisfactorias. No cerrar frontend ni comenzar backend por esta entrega. Si se desea un header visualmente idéntico en ambos roles, documentar y aprobar ese cambio de estilo por separado.

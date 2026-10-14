# Guía de diseño de interfaz

Esta guía define el lenguaje visual vigente de la aplicación y las reglas obligatorias para nuevas pantallas y features. La implementación de referencia está en `field-app/src/styles/tokens.css`, `field-app/src/styles/app.css` y `field-app/src/styles/`; los cambios visuales deben conservar coherencia con el shell compartido de administración y campo.

## Dirección visual

- Interfaz operativa, sobria y cálida: fondos crema, superficies claras, texto de alto contraste y naranja SEPSA para acciones principales.
- Priorizar lectura rápida de órdenes, clientes, suministros, estados y acciones. La decoración nunca debe competir con información necesaria para trabajar.
- Usar los componentes y patrones existentes antes de introducir una variante nueva: `AppHeader`, `UiState`, `Notification`, `AppModal`, `SearchField` y `PaginationControls` son referencias compartidas.
- Esta guía describe la UI; las reglas de producto, seguridad y operación siguen siendo las de [`RULES.md`](RULES.md). La interfaz nunca sustituye autorización ni validación en la capa autoritativa.

## Paleta vigente

Los valores salen de `field-app/src/styles/tokens.css`. Consumir las variables CSS, no copiar los valores hexadecimales en componentes.

### Base y tema de campo

`:root` aporta los valores generales; `.field-app` y `[data-ui-theme="field"]` los sustituyen dentro del tema de campo. En una pantalla de campo, los valores efectivos son los de la columna correspondiente.

| Uso | Variable | Base | Campo |
|---|---|---:|---:|
| Texto principal | `--ink` | `#1e2423` | `#172033` |
| Texto secundario | `--muted` | `#68706c` | `#68717d` |
| Fondo de aplicación | `--warm-bg` | `#f3efe7` | `#f6f3ed` |
| Superficie | `--surface` | `#fbfaf7` | `#fffdf9` |
| Papel / superficie blanca | `--paper` | `#ffffff` | `#FFFFFF` |
| Borde | `--line` | `#ded8cc` | `#e8e1d7` |
| Acción/acento principal | `--accent` | `#c45b19` | `#E85D04` |
| Fondo suave de acento | `--accent-soft` | `#fff1d2` | `#fff0e4` |
| Aviso | `--warning` | `#e7a629` | `#b87915` |

### Colores semánticos

Usar el color semántico solo para comunicar su significado. Acompañarlo con texto, icono o etiqueta; nunca indicar estado únicamente por color.

| Significado | Variable | Color | Fondo suave |
|---|---|---:|---:|
| Éxito / confirmado | `--sepsa-green` / `--sepsa-green-soft` | `#1F9D61` | `#EAF8F1` |
| Advertencia / atención | `--sepsa-yellow` / `--sepsa-yellow-soft` | `#D99A16` | `#FFF7DB` |
| Error / bloqueo | `--sepsa-red` / `--sepsa-red-soft` | `#D92D20` | `#FEECEB` |
| Información | `--sepsa-blue` / `--sepsa-blue-soft` | `#2563EB` | `#EEF4FF` |
| Neutro | `--sepsa-neutral-soft` | — | `#F2F4F7` |

El naranja (`--sepsa-orange`, `--accent`) identifica acción primaria y marca SEPSA; no representa éxito ni error. El hover usa `--sepsa-orange-hover` (`#C94D00`).

### Regla de consistencia de color

- Toda nueva UI debe usar los tokens semánticos existentes y respetar el tema activo; no añadir colores hex/RGB directos para texto, superficies, bordes, acciones o estados comunes.
- Si falta un significado o token, reutilizar el token semánticamente más cercano solo si expresa el mismo significado. En caso contrario, proponer el token en `tokens.css` y documentar el cambio en esta tabla.
- No introducir nuevas tonalidades del naranja, verde, amarillo, rojo o azul por componente.
- Hay estilos históricos en `styles.css` con colores directos que no coinciden exactamente con todos los tokens. Son deuda de implementación, no una paleta alternativa para features nuevas. Migrar solo el estilo afectado al tocarlo; evitar refactors ajenos a la feature.

## Tipografía, escala y componentes

- Familia: Manrope; usar la pila y configuración declaradas en `tokens.css` y `app.css`. Mantener números tabulares en datos operativos.
- Usar la escala existente: caption `12/16px`, cuerpo y controles `14/20px`, encabezado de sección `20/28px`. Mantener la jerarquía de títulos de página ya usada por el shell.
- Usar los tokens de espaciado `--space-*` (de `2px` a `96px`) y radios `--radius-*` (`4px`, `6px`, `8px`, `12px`, `16px`, `24px`, `32px`, pill y circular). No agregar escalas locales.
- Controles interactivos: altura mínima `--control-height` (`44px`); mantener áreas táctiles cómodas y no reducirlas para que quepa más contenido.
- Reutilizar tarjetas, paneles, campos, badges, alertas, diálogos y navegación existentes. Una variante nueva requiere una necesidad distinta y consistente entre administración y campo, no solo preferencia estética.
- Aplicar niveles de superposición existentes (`--layer-*`) para dropdowns, navegación, header, fullscreen y modales; no inventar `z-index` arbitrarios.

## Reglas obligatorias para nuevas features

Antes de considerar lista una feature visual, debe cumplir todos estos puntos:

1. **Jerarquía clara.** El título explica dónde está el usuario; el contenido primario y la acción principal son distinguibles; las acciones destructivas o físicas no se confunden con navegación o acciones secundarias.
2. **Estados completos.** Diseñar y revisar carga, contenido, vacío, error recuperable, sin conexión y permisos insuficientes. Para operaciones también distinguir guardado local, pendiente de sincronización, sincronizado/confirmado, fallido, bloqueado, incierto y revisión humana, según aplique.
3. **Resultado accionable.** Cada mensaje de error o estado explica qué se guardó, qué no se pudo completar y el siguiente paso. Un resultado remoto incierto no debe presentarse como éxito ni ofrecer repetición automática de una acción física.
4. **Offline-first visible.** Cuando una operación pueda guardarse localmente, la UI distingue el guardado local de la confirmación remota. No ocultar operaciones pendientes ni presentar datos locales como confirmados por el servidor.
5. **Permisos y seguridad.** La UI puede ocultar o deshabilitar acciones según contexto, pero la autorización debe verificarse también en la capa autoritativa. Un estado de pantalla, caché o falta de conectividad nunca autoriza un corte físico.
6. **Accesibilidad.** Todo control tiene nombre y propósito accesibles; la interfaz funciona con teclado y conserva foco visible; errores y cambios de estado se anuncian con semántica/live regions apropiadas. Diálogos contienen el foco, cierran con Escape cuando corresponda y lo devuelven al disparador.
7. **Color no es el único canal.** Estados y selección llevan texto o icono además del color. El contraste de texto y controles debe cumplir WCAG 2.2 AA (4.5:1 para texto normal, 3:1 para texto grande y componentes gráficos relevantes).
8. **Responsive real.** Verificar los breakpoints actuales (`1000`, `760`, `560`, `430` y `380px`), teclado virtual y áreas seguras del dispositivo. En móvil, priorizar el siguiente trabajo de campo, no comprimir la pantalla de escritorio.
9. **Movimiento controlado.** Usar duraciones/easing existentes; respetar `prefers-reduced-motion`. La animación no puede ser necesaria para entender un cambio de estado.
10. **Sin regresión de flujo.** Mantener navegación, filtros, paginación, sincronización y confirmación consistentes con las pantallas existentes. Si se cambia un estado operativo, revisar sus mensajes en desktop y móvil.

## Patrones responsivos actuales

- El shell compartido conserva marca, contexto, conectividad y cuenta; las acciones y el título pertenecen al contexto de la pantalla.
- A partir del breakpoint de `1000px`, los diseños de contenido y panel lateral pasan a una sola columna.
- Las tablas de datos de solo lectura se convierten en tarjetas por debajo de `760px`: cada celda lleva `data-label` con el nombre de su columna, y el encabezado de la tabla se oculta. Las operaciones por conciliar no usan tabla: son tarjetas paginadas en un diálogo que se abre desde el menú de cuenta, y sus contadores muestran solo cifras (D024).
- En móvil se usa la navegación inferior existente, se respetan áreas seguras y las listas/detalles se adaptan al flujo de una sola tarea.
- Captura de campo y mapas pueden usar superficies de pantalla completa cuando el flujo existente lo requiera; deben mantener acción primaria visible, manejo de teclado/foco y salida clara.
- Antes de crear navegación o un layout móvil nuevo, comprobar si el patrón equivalente ya está implementado en `FieldApp.tsx` y `styles.css`.

## Fuentes y mantenimiento

- Tokens y tema: [`../field-app/src/styles/tokens.css`](../field-app/src/styles/tokens.css).
- Estilos compartidos y responsivos: [`../field-app/src/styles/app.css`](../field-app/src/styles/app.css) y [`../field-app/src/styles/`](../field-app/src/styles/).
- Shell y componentes: `field-app/src/components/AppHeader.tsx` y, en `field-app/src/components/common/`, `UiState.tsx`, `Modal.tsx`, `SearchField.tsx` y `PaginationControls.tsx`.
- Reglas de operación, offline y autorización: [`RULES.md`](RULES.md), [`features/cuts.md`](features/cuts.md) y [`features/synchronization.md`](features/synchronization.md).

Actualizar esta guía cuando cambie la paleta, escala, navegación o patrón responsivo vigente. Si la guía y el código difieren, confirmar cuál es la intención antes de extender la divergencia; no asumir que los estilos históricos son una decisión de diseño.

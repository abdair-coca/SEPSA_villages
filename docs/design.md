# SEPSA Design System
## `design.md`

> **Objetivo:** estandarizar toda la experiencia web de SEPSA — administración y trabajo de campo — con una interfaz clara, consistente, moderna y orientada a tareas.
>
> **Principio rector:** **persona → situación → acción → detalle técnico**.
>
> Los datos humanos y operativos siempre deben tener más peso visual que los identificadores internos, UUID, CUC largos, device IDs o trazas.

---

# 1. Principios de producto

## 1.1 Claridad antes que densidad
La interfaz debe permitir entender el estado de una pantalla en menos de 5 segundos.

Cada vista debe responder visualmente:

- ¿Dónde estoy?
- ¿Qué está pasando?
- ¿Qué debo hacer ahora?
- ¿Qué información necesito para hacerlo?
- ¿Qué información es secundaria?

Evitar mostrar todos los datos posibles al mismo tiempo.

## 1.2 Una acción principal por contexto
Cada sección debe tener una acción principal claramente dominante.

| Contexto | Acción principal |
|---|---|
| Buscar suministros | **Buscar** |
| Suministro seleccionado | **Crear orden de corte** |
| Orden creada | **Asignar técnico** |
| Técnico en campo | **Registrar corte** |
| Cola con fallos | **Sincronizar ahora** |
| Sin órdenes | **Actualizar bandeja** |

Las acciones secundarias deben utilizar botones outline o ghost.

## 1.3 Información humana antes que códigos
Nunca utilizar un UUID, CUC largo, ID de operación o `device-id` como título principal.

### Correcto

**Elena Poma**  
`Cuenta CTA-1007 · Medidor MED-1007`

`CUC: 57f28e2f…0456  ⧉`

### Incorrecto

**cuc-57f28e2f-61ed-4b93-907d-0b966fbd0456**

Los identificadores técnicos deben:
- aparecer en tamaño pequeño;
- utilizar color secundario;
- truncarse cuando sean largos;
- incluir acción de copiar cuando sea útil;
- mostrarse completos únicamente en vistas técnicas, tooltips o paneles expandibles.

---

# 2. Personalidad visual

La interfaz SEPSA debe sentirse:
- institucional;
- confiable;
- operativa;
- simple;
- moderna;
- cálida;
- legible;
- robusta para uso en campo.

No debe sentirse como una aplicación bancaria fría ni como un dashboard excesivamente tecnológico.

---

# 3. Paleta de color

## 3.1 Variables base

```css
:root {
  --sepsa-bg: #F6F3ED;
  --sepsa-surface: #FFFFFF;
  --sepsa-surface-soft: #FBF9F5;

  --sepsa-text: #172033;
  --sepsa-text-secondary: #667085;
  --sepsa-text-muted: #98A2B3;

  --sepsa-border: #E5E7EB;
  --sepsa-border-strong: #D0D5DD;

  --sepsa-orange: #E85D04;
  --sepsa-orange-hover: #C94D00;
  --sepsa-orange-soft: #FFF1E6;

  --sepsa-green: #1F9D61;
  --sepsa-green-soft: #EAF8F1;

  --sepsa-yellow: #D99A16;
  --sepsa-yellow-soft: #FFF7DB;

  --sepsa-red: #D92D20;
  --sepsa-red-soft: #FEECEB;

  --sepsa-blue: #2563EB;
  --sepsa-blue-soft: #EEF4FF;

  --sepsa-neutral-soft: #F2F4F7;
}
```

## 3.2 Uso semántico

| Color | Uso |
|---|---|
| Naranja | marca, CTA principal, selección |
| Verde | conectado, sincronizado, ejecutado correctamente |
| Amarillo | pendiente, advertencia no crítica |
| Rojo | error, incidencia, bloqueo, acción destructiva |
| Azul | información, GPS, navegación, acciones técnicas |
| Gris | información secundaria, IDs, estados neutros |

No utilizar rojo para acciones normales.

---

# 4. Fondo y superficies

## Fondo general
Usar `#F6F3ED`.

Nunca usar blanco puro como fondo de toda la aplicación.

## Cards

```css
background: #FFFFFF;
border: 1px solid #E5E7EB;
border-radius: 12px;
box-shadow: 0 2px 8px rgba(16, 24, 40, 0.04);
```

En pantallas muy densas puede utilizarse `border-radius: 10px`.

Evitar sombras fuertes.

---

# 5. Tipografía

Fuente preferida:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Si `Inter` no está disponible, utilizar el stack del sistema.

| Elemento | Tamaño | Peso |
|---|---:|---:|
| Page title | 30–34 px | 700 |
| Section title | 20–24 px | 650–700 |
| Card title | 17–20 px | 650 |
| Important value | 16–18 px | 600–700 |
| Body | 14–15 px | 400 |
| Label | 12–13 px | 500–600 |
| Secondary/meta | 12–13 px | 400 |
| Technical ID | 11–12 px | 400–500 |

Reglas:
- Nunca usar texto funcional por debajo de 12 px.
- No usar uppercase en párrafos.
- Uppercase solo para eyebrows pequeños como `SEPSA · CAMPO`.
- Evitar labels con contraste demasiado bajo.

---

# 6. Espaciado

Sistema base de 4 px:

```text
4   micro
8   pequeño
12  compacto
16  estándar
20  cómodo
24  sección
32  bloque
40  separación grande
48  separación mayor
```

Reglas:
- Padding de card: 20–24 px desktop.
- Gap entre cards: 16–20 px.
- Gap entre secciones: 24–32 px.
- No colocar más de 3 niveles visuales dentro de una misma card sin separación.

---

# 7. Layout general

```css
.app-shell {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 32px 40px;
}
```

En pantallas muy grandes puede usarse `max-width: 1560px`.

No usar sidebar por defecto en esta etapa.

La navegación debe mantenerse en:
- header superior;
- tabs;
- stepper;
- navegación contextual.

---

# 8. Header

**Izquierda**
- eyebrow: `SEPSA · CAMPO` o `SEPSA · ADMINISTRACIÓN`
- título de la vista;
- subtítulo de una línea;
- contexto secundario como técnico/usuario.

**Derecha**
- estado de conexión cuando aplique;
- última actualización;
- acciones secundarias;
- cerrar sesión.

Ejemplo:

```text
SEPSA · CAMPO
Jornada de campo
Órdenes asignadas, ejecución de cortes y sincronización en terreno.

Técnico: Camila Rojas
Dispositivo: device-60cfeb79…
```

El `device-id` jamás debe competir con el nombre del técnico.

---

# 9. Environment banner

Cuando el sistema no esté conectado todavía a datos oficiales:

```text
Datos de demostración · fuente pendiente de validación con SEPSA
```

Estilo:
- fondo amarillo muy suave;
- icono info;
- tamaño compacto;
- no utilizarlo como alerta crítica.

---

# 10. KPIs

Máximo recomendado: **5–6**.

### Administrador
- Generadas
- Sin asignar
- Asignadas
- Ejecutadas
- Anuladas

### Técnico
- Por ejecutar
- En revisión
- Ejecutadas
- Anuladas
- En cola

```css
.kpi-card {
  min-height: 72px;
  padding: 16px;
  border: 1px solid var(--sepsa-border);
  border-radius: 12px;
  background: var(--sepsa-surface);
}
```

El número es el elemento dominante.

No mostrar métricas técnicas como `98 trazas` junto a métricas operativas.

---

# 11. Stepper

### Administración

```text
1 Buscar suministro
2 Crear orden
3 Asignar técnico
4 Revisar orden
```

Estados:
- activo: naranja;
- completado: verde o naranja suave;
- pendiente: gris;
- bloqueado: gris claro.

El usuario siempre debe saber en qué paso se encuentra.

---

# 12. Cards de suministro

Evitar tablas densas para selección de clientes/suministros.

Orden de información:
1. Nombre del cliente.
2. Deuda.
3. Estado.
4. Cuenta / medidor.
5. Localidad / ruta.
6. Acción.

Ejemplo:

```text
Elena Poma                         [Seleccionado]

Cuenta CTA-1007 · Medidor MED-1007

Bs 425.00
8 facturas pendientes

San Pedro · Ruta 004
```

Seleccionado:

```css
border-color: var(--sepsa-orange);
background: #FFF9F4;
```

---

# 13. Ficha de suministro / orden

Nunca comenzar una ficha con un código técnico.

Título correcto:

```text
Orden de corte · Elena Poma
```

Meta secundaria:

```text
Cuenta CTA-1007 · Medidor MED-1007
CUC: 57f28e2f…0456
```

Resumen recomendado:
- Cliente
- Dirección
- Medidor
- Circuito
- Técnico
- Deuda
- Estado
- Área / localidad

Los valores deben tener mayor peso que los labels.

---

# 14. Códigos técnicos

Incluye:
- CUC;
- UUID;
- order ID;
- device ID;
- sync ID;
- operación interna;
- origen de tabla.

Componente recomendado:

```text
CUC
57f28e2f…0456  ⧉
```

```css
.technical-id {
  font-size: 12px;
  color: var(--sepsa-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

No usar monospace para el resto de la interfaz.

---

# 15. Botones

## Primary

```css
.btn-primary {
  background: var(--sepsa-orange);
  color: #fff;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 8px;
  font-weight: 600;
}
```

## Secondary

```css
background: #FFFFFF;
border: 1px solid #D0D5DD;
color: #344054;
```

## Destructive
Rojo únicamente para:
- anular;
- eliminar;
- confirmar incidencia crítica.

Reglas:
- máximo una acción primaria por card;
- iconos opcionales a la izquierda;
- botones con verbos claros;
- evitar `Procesar` si existe un verbo más específico.

---

# 16. Estados y badges

Ejemplos:

```text
Generada
Sin asignar
Asignada
Por ejecutar
En revisión
Ejecutada
Anulada
Conectada
Sin conexión
Pendiente de sincronizar
```

Pills con altura de 24–28 px.

No utilizar colores saturados de fondo.

---

# 17. Búsqueda

Placeholder recomendado:

```text
Buscar por cuenta, medidor o cliente…
```

Evitar listar UUID, CUC y otros criterios técnicos si el buscador ya los soporta internamente.

---

# 18. Filtros

Mostrar únicamente los filtros frecuentes.

Los secundarios bajo:

```text
Más filtros
```

### Administración
- Área
- Localidad
- Ruta
- Facturas vencidas
- Estado

### Técnico
- Todas
- Por ejecutar
- Ejecutadas
- Anuladas
- Revisión

Preferir chips para estados y selects para datos geográficos.

---

# 19. Tablas

Usar tablas para:
- deuda;
- facturas;
- trazabilidad extensa;
- reportes.

No utilizar tablas para seleccionar una orden en móvil/campo.

Estilo:
- header gris cálido suave;
- row height mínimo 44 px;
- números alineados a la derecha;
- sin líneas verticales fuertes;
- hover sutil;
- status con badge.

---

# 20. Deuda

```text
Deuda total
Bs 425.00
```

Color naranja, no rojo.

Tabla recomendada:
- Periodo
- Fecha facturación
- Monto
- Estado
- Días mora

`FA_FACTURAS` debe mostrarse como dato secundario.

---

# 21. Mapa

El mapa es una herramienta secundaria.

Reglas:
- no ocupar más del 35–40% del viewport inicial;
- poder expandirse;
- mostrar mi ubicación, orden seleccionada y zona de órdenes;
- evitar mapa enorme cuando no hay órdenes.

Controles:

```text
Mi ubicación
Rastrear
Zona de órdenes
Expandir mapa
```

---

# 22. Orden actual del técnico

Debe ser el bloque con mayor peso visual de la vista de campo.

Jerarquía:

**Elena Poma**

`Cuenta CTA-1007 · Medidor MED-1007`

`CUC: 57f28e2f…0456`

Luego:
- Dirección
- Ruta
- Referencia
- Deuda
- Facturas pendientes
- Estado
- GPS
- Distancia

Acción primaria:

```text
Registrar corte
```

Secundarias:

```text
Ver ubicación
Ver detalle
Marcar incidencia
```

---

# 23. Readiness strip

Ejemplo:

```text
✓ GPS listo
✓ Ubicación disponible
! Pendiente registrar corte
```

Estados:
- verde: listo;
- amarillo: pendiente;
- rojo: bloqueante.

---

# 24. Cola de sincronización

Vacía:

```text
No hay operaciones pendientes.
Todas las operaciones están sincronizadas.
```

Con elementos mostrar:
- tipo;
- cliente;
- hora;
- estado;
- acción de reintento.

Nunca mostrar JSON, IDs o errores técnicos en la vista primaria.

---

# 25. Actividad reciente

Correcto:

```text
Bandeja actualizada
hace 1 min

Orden de Elena Poma recibida
09:12

GPS disponible
09:11
```

Evitar:

```text
SYNC_JOB_8ae9231 completed
```

Las trazas técnicas van en diagnóstico.

---

# 26. Estados vacíos

### Técnico sin órdenes

```text
No tienes órdenes asignadas en este momento.

Actualiza la bandeja o espera una nueva asignación.

[Actualizar bandeja]
```

### Sin cola

```text
No hay operaciones pendientes.
Todas las operaciones están sincronizadas.
```

No mostrar grandes áreas vacías.

---

# 27. Alerts

## Info
Azul suave.

## Success
Verde suave.

## Warning
Amarillo suave.

## Error
Rojo suave.

Incorrecto:

```text
An active order already exists: order-a23f...
```

Correcto:

```text
Este suministro ya tiene una orden activa.
Creada hoy a las 20:51 · Sin técnico asignado.
[Ver orden]
```

---

# 28. Formularios

Labels siempre visibles.

```css
input,
select,
textarea {
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid #D0D5DD;
  padding: 0 12px;
}

input:focus,
select:focus,
textarea:focus {
  border-color: #E85D04;
  box-shadow: 0 0 0 3px rgba(232, 93, 4, 0.10);
}
```

---

# 29. Iconografía

Utilizar una sola familia:
- Lucide;
- Heroicons;
- Font Awesome si ya está integrado.

Reglas:
- normal: 16–18 px;
- KPI: 20–24 px;
- no mezclar outline y filled sin razón;
- iconos acompañan al texto, no lo reemplazan en acciones críticas.

---

# 30. Responsive

## Desktop > 1200 px

Administración:

```text
45% búsqueda
55% creación / asignación
```

Campo:

```text
65% orden + lista
35% mapa + sincronización
```

## Tablet 768–1199 px
- cards en una columna principal;
- mapa debajo de orden actual;
- KPIs 2–3 por fila;
- acciones siguen visibles.

## Mobile < 768 px

Orden:
1. Header compacto.
2. Conectividad.
3. Orden actual.
4. Acción principal sticky opcional.
5. Lista de órdenes.
6. Mapa.
7. Sincronización.

No colocar tablas anchas en móvil.

---

# 31. Grid

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(320px, 0.9fr);
  gap: 20px;
}

.admin-workflow-grid {
  display: grid;
  grid-template-columns: minmax(340px, 0.9fr) minmax(0, 1.1fr);
  gap: 20px;
}
```

---

# 32. Animaciones

```css
transition: 150ms ease;
```

Permitido:
- hover;
- expandir/cerrar;
- cambio de estado;
- skeleton loading;
- toast.

Evitar animaciones decorativas largas.

---

# 33. Loading

Nunca bloquear toda la pantalla si solo se está actualizando una card.

Usar:
- skeleton;
- spinner pequeño;
- texto contextual.

Ejemplo:

```text
Actualizando órdenes…
```

---

# 34. Toasts

Posición recomendada: esquina superior derecha.

Duración:
- success: 3–4 s;
- info: 4–5 s;
- error: persistente si requiere acción.

Ejemplos:

```text
Orden creada correctamente.
Técnico asignado.
Corte guardado localmente.
Sincronización completada.
```

---

# 35. Offline-first

Diferenciar claramente:

```text
Guardado en dispositivo
Pendiente de sincronización
Sincronizado
Error de sincronización
```

Nunca hacer creer al usuario que una operación llegó al servidor si solo está guardada localmente.

---

# 36. Copywriting

Usar:
- Crear orden de corte
- Asignar técnico
- Registrar corte
- Actualizar bandeja
- Sincronizar ahora
- Ver ubicación
- Marcar incidencia
- Ver detalle

Evitar:
- Ejecutar operación
- Procesar
- Submit
- Sync job
- Trigger
- CRUD

La interfaz debe hablar en lenguaje operacional.

---

# 37. Jerarquía universal

## Nivel 1 — humano
- nombre;
- situación;
- deuda;
- estado;
- siguiente acción.

## Nivel 2 — operacional
- cuenta;
- medidor;
- ruta;
- fechas;
- técnico;
- ubicación.

## Nivel 3 — técnico
- CUC;
- UUID;
- IDs;
- tablas origen;
- trazas;
- device ID.

Los niveles no deben competir visualmente.

---

# 38. Componentes estándar

```text
AppHeader
EnvironmentBanner
ConnectivityStatus
KpiCard
WorkflowStepper
SearchInput
FilterBar
StatusChip
SupplyCard
OrderCard
OrderSummary
DataField
TechnicalId
PrimaryAction
SecondaryAction
DebtSummary
DebtTable
MapCard
ReadinessStrip
SyncQueue
ActivityFeed
EmptyState
AlertBanner
ConfirmDialog
Toast
Skeleton
```

No crear estilos únicos para cada página si existe un componente equivalente.

---

# 39. Accesibilidad

- contraste mínimo WCAG AA;
- foco visible;
- elementos interactivos mínimo 40–44 px;
- botones con texto;
- no depender únicamente de color;
- estados con icono + texto;
- soporte de teclado en administración.

---

# 40. Administración vs Campo

Ambos roles comparten el mismo sistema visual.

## Administración
Prioridad:

```text
buscar → seleccionar → crear → asignar → revisar
```

## Campo
Prioridad:

```text
orden actual → ubicación → registrar → sincronizar
```

No copiar exactamente el mismo layout para ambos roles.

---

# 41. Checklist de aprobación

Antes de aprobar cualquier pantalla:

```text
¿Puedo entender quién es el cliente?
¿Puedo entender qué está pasando?
¿Puedo saber cuál es la siguiente acción?
¿Los códigos técnicos están en segundo plano?
¿La información importante se puede leer rápidamente?
¿Hay solo una acción primaria dominante?
¿La pantalla funciona con mala conexión?
¿La interfaz conserva el lenguaje visual SEPSA?
```

Si alguna respuesta es **no**, la pantalla todavía necesita simplificarse.

---

# 42. Resumen visual

```text
FONDO
#F6F3ED

CARDS
#FFFFFF
border #E5E7EB
radius 12px

PRIMARIO
#E85D04

TEXTO
#172033

SECUNDARIO
#667085

ÉXITO
#1F9D61

PENDIENTE
#D99A16

ERROR
#D92D20

INFO
#2563EB
```

---

# 43. Mantra del sistema

> **El usuario debe ver primero lo que necesita entender y hacer; los datos que el sistema necesita internamente vienen después.**

Para SEPSA:

> **Cliente → ubicación → situación → acción → detalle técnico.**

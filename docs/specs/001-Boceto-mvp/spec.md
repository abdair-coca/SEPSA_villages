# Especificación: Boceto MVP

## Propósito

Prototipo navegable HTML/CSS/JS vanilla que valida el flujo offline-first de cobranza del técnico de SEPSA: domicilios, deuda, visitas y cobro en efectivo, con persistencia local y sync simulada. Sin backend.

## Requisitos

### Requisito: Navegación inferior con 4 secciones

DEBE ofrecer navegación inferior móvil con Inicio, Domicilios, Cobros y Más, con iconos/texto y estado activo evidente.

#### Escenario: Cambio de sección

- GIVEN prototipo cargado
- WHEN técnico toca "Domicilios"
- THEN se muestra la lista y "Domicilios" activo

### Requisito: Pantalla de inicio

DEBE mostrar saludo, zona, conteos (asignados, visitados, pendientes, cobros, monto), última sincronización y estado de conexión.

#### Escenario: Datos de jornada

- GIVEN técnico con cobros, WHEN abre Inicio
- THEN ve cantidades y total de Bs cobrados

#### Escenario: Sin conexión

- GIVEN modo offline activo
- THEN Inicio muestra "Sin conexión · trabajando localmente"

### Requisito: Lista de domicilios asignados

DEBE mostrar solo domicilios asignados al técnico, con buscador, filtros, nombre, código, localidad, meses pendientes, deuda y estado (Pendiente/Al día).

#### Escenario: Búsqueda por nombre

- GIVEN lista de domicilios
- WHEN técnico escribe "Juan"
- THEN solo aparecen coincidencias

#### Escenario: Domicilio al día

- GIVEN domicilio con 0 meses
- THEN estado "Al día" y deuda Bs 0

### Requisito: Detalle del domicilio

DEBE priorizar visualmente la deuda (meses y total), mostrar dirección, localidad, medidor, estado, y ofrecer "Registrar visita" y "Cobrar" (primaria).

#### Escenario: Consulta de deuda

- GIVEN domicilio con 21 meses
- WHEN técnico abre el detalle
- THEN "21 meses" y "Bs 840" dominan visualmente

### Requisito: Registro de visita

DEBE confirmar la visita, aceptar observación corta opcional y funcionar sin conexión.

#### Escenario: Visita sin pago

- GIVEN técnico en domicilio
- WHEN registra visita "Usuario no se encontraba"
- THEN se confirma y el domicilio queda visitado

### Requisito: Selección de meses a cobrar

DEBE permitir solo cantidad entera de meses (sin fracciones) y aplicar SIEMPRE los más antiguos primero. El técnico NO DEBE seleccionar meses posteriores dejando anteriores pendientes.

#### Escenario: Pago de 6 de 21 meses

- GIVEN 21 meses pendientes, deuda Bs 840
- WHEN selecciona 6 meses
- THEN se listan los 6 más antiguos y el total es Bs 240

#### Escenario: Fracción rechazada

- GIVEN selector de meses
- WHEN intenta 1.5 meses
- THEN se rechaza y se mantiene un entero

### Requisito: Confirmación de cobro

Antes de registrar DEBE mostrarse confirmación con cliente, meses, total, método Efectivo y advertencia de verificación.

#### Escenario: Confirmar cobro

- GIVEN 6 meses por Bs 240
- WHEN técnico confirma
- THEN se registra el pago localmente y se genera comprobante

### Requisito: Pago registrado y deuda actualizada

DEBE mostrar éxito con meses pagados, importe, deuda restante y "Pendiente de sincronización". La deuda local DEBE actualizarse de inmediato.

#### Escenario: Deuda decrece

- GIVEN 21 meses / Bs 840
- WHEN se confirma pago de 6 / Bs 240
- THEN queda 15 meses / Bs 600, pendiente de sync

### Requisito: Comprobante

Cada cobro DEBE generar comprobante con institución, cliente, código, meses pagados, total, método, técnico, fecha, ID único `CP-YYYYMMDD-NNNNNN` y estado de sync. Consultable offline.

#### Escenario: Comprobante generado

- GIVEN pago confirmado
- THEN se muestra comprobante con ID único y Compartir/Guardar (simulados)

### Requisito: Historial de cobros

DEBE listar los pagos del técnico con estado de sincronización visible.

#### Escenario: Estados en historial

- GIVEN cobros sincronizados y pendientes
- THEN cada uno muestra su estado

### Requisito: Modo offline simulado

DEBE incluir "Simular modo offline". En offline DEBE seguir permitiendo buscar, consultar deuda, registrar visitas, cobrar y generar comprobantes, sin errores de red, con indicador y contador "N cambios pendientes".

#### Escenario: Cobro offline

- GIVEN modo offline
- WHEN cobra Bs 240
- THEN se confirma, entra a la cola y "1 cambio pendiente"

#### Escenario: Persistencia tras recarga

- GIVEN cobro registrado offline
- WHEN recarga la página
- THEN cobro y comprobante persisten

### Requisito: Sincronización simulada

Al volver online DEBE simular sync con progreso, completar la cola, marcar "Sincronizado" y mostrar última sincronización.

#### Escenario: Sync automática

- GIVEN 8 cambios pendientes
- WHEN se recupera conexión
- THEN sincroniza hasta "10 cambios sincronizados" (100%)

#### Escenario: No perder operación

- GIVEN sync en progreso
- WHEN falla una operación
- THEN permanece en cola como `failed` y se reintenta

### Requisito: Datos de simulación

DEBE incluir 10–20 domicilios ficticios cubriendo: sin deuda, 3 y 21 meses, visitado, con pago registrado y pago pendiente de sync.

#### Escenario: Diversidad de escenarios

- GIVEN datos semilla
- THEN existen domicilios en cada estado enumerado
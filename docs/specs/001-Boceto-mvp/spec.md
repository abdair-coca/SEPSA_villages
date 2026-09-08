# Especificación: Boceto MVP del Ecosistema SEPSA (Pantallas Operativas Reales)

## Propósito

El prototipo DEBE implementarse como una aplicación web de escritorio standalone en boceto-mvp/ que simule fielmente las interfaces operativas reales de SEPSA (cortes.sepsa.net.bo, pantallas P-01 a P-05), permitiendo a usuarios y desarrolladores validar visual y transaccionalmente el ciclo de cortes sin requerir backend.

## Requisitos y Escenarios

### Requisito: P-01 Dashboard Principal

El sistema DEBE presentar la pantalla de bienvenida y control institucional observada en la evidencia visual.

#### Scenario: Carga de Inicio
- GIVEN el usuario abre index.html
- THEN observa la barra superior con el logo, el badge verde 'BASE DE DATOS OFICIAL', campana de notificaciones (2), selector de modo y perfil de 'JOSUE DANIEL QUINTANILLA TABOADA'
- AND observa el badge amarillo con temporizador regresivo de sesión ('Actualización automática en 6 min 18 seg')
- AND observa la tarjeta izquierda de datos de usuario con el formulario de teléfono celular
- AND observa la tarjeta derecha 'Opciones de Corte y reconexión por morosidad' con los botones destacados:
  - Tarjeta roja: 'Ver Registros para Cortar (Con mapa)' -> navega a P-03
  - Tarjeta roja: 'Órdenes de corte (Como en NEXO)'
  - Tarjeta azul: 'Reposiciones (Con mapa)'

---

### Requisito: P-02 Búsqueda de Morosidad y Emisión de Lote (/orden/create)

El sistema DEBE permitir parametrizar filtros territoriales y generar lotes masivos de corte.

#### Scenario: Filtrado en cascada
- GIVEN la pantalla P-02
- WHEN el usuario selecciona Área Regional 'B - BETANZOS'
- THEN el selector de Localidad se habilita con '002 - MOJOTORILLO'
- WHEN selecciona '002 - MOJOTORILLO'
- THEN el selector de Ruta se habilita con '002 - MOJOTORILLO'
- AND el spinner de facturas muestra por defecto '2'
- AND se muestra el banner informativo sobre exclusión de intereses (BR-002)
- WHEN pulsa 'Buscar'
- THEN la tabla T-01 despliega los clientes morosos observados:
  - Cuenta 306040, MUÑOZ PEDRO, Ruta 002, Orden 129, Circuito D-1182, Tarifa RS, Medidor 240907792 WASION, Facturas > 30 días: 2, Total: 66.82 Bs
  - Cuenta 306043, FLORES JUSTO, Ruta 002, Orden 132, Circuito D-1182, Tarifa RS, Total: 45.20 Bs

#### Scenario: Emisión masiva de corte
- GIVEN la tabla T-01 con clientes morosos
- WHEN el usuario pulsa el botón rojo 'Crear orden de corte'
- THEN el sistema genera para cada cuenta una orden en estado 'GENERADO' con un C.U.C. único
- AND redirige automáticamente a la pantalla P-03 (/verCortes) incorporando las nuevas órdenes

---

### Requisito: P-03 Bandeja de Registros para Cortar (/verCortes)

El sistema DEBE listar las órdenes activas en estado GENERADO con cálculo dinámico de antigüedad.

#### Scenario: Inspección de bandeja
- GIVEN la pantalla P-03
- THEN se muestra el badge de contador destacado con valor '46' registros en estado GENERADO
- AND la tabla T-02 calcula dinámicamente 'DÍAS DESDE GENERACIÓN' con decimales (ej. 9.21 días)
- AND cada fila cuenta con el botón azul 'Ver corte'
- WHEN el usuario pulsa 'Ver corte' en una orden
- THEN navega a la Ficha Integral P-04 con el ID y datos de esa orden

---

### Requisito: P-04 Ficha Integral de Corte (/corte/{id})

El sistema DEBE desplegar la vista 360 grados del suministro, su deuda y controles de ejecución.

#### Scenario: Visualización de ficha activa
- GIVEN la ficha P-04 de una orden en estado GENERADO (ej. CUC 443794, cuenta 1701603 / 306040)
- THEN se muestra el encabezado con el CUC y el badge rojo 'ESTADO: GENERADO'
- AND se despliega la tabla T-03 con el desglose de planillas impagas (Periodos 6, 7 y 8 / 2026, origen FA_FACTURAS, total 66.82 Bs, estado P)
- AND se muestran los indicadores de salvaguarda: 'Tiene Reclamos: NO', 'Plan de Pago: NO'
- AND se despliegan las pestañas colapsables inferiores de auditoría (Datos de Corte, Suspensión, Pago, Reconexión)
- AND el botón rojo 'Registrar corte efectivo' está habilitado

#### Scenario: Demostración de anulación concurrente (BR-003)
- GIVEN la ficha P-04 de una orden en estado GENERADO
- WHEN el usuario pulsa el botón de simulación 'Simular pago concurrente en ventanilla'
- THEN el badge de estado cambia inmediatamente a 'ESTADO: ANULADO'
- AND se despliega el texto de auditoría: 'Anulado ya que pago parte o la totalidad de facturas vencidas, Fecha de pago: [timestamp]'
- AND el botón 'Registrar corte efectivo' queda deshabilitado

---

### Requisito: P-05 Modal Formulario de Registro de Corte Efectivo

El sistema DEBE capturar la intervención física de campo con opciones de bypass.

#### Scenario: Registro con GPS y lectura
- GIVEN la ficha P-04 con orden GENERADA
- WHEN el usuario pulsa 'Registrar corte efectivo'
- THEN se abre el modal P-05 con el técnico autoasignado ('JOSUE DANIEL QUINTANILLA TABOADA')
- WHEN pulsa 'Obtener ubicación'
- THEN los campos Latitud y Longitud se completan con coordenadas GPS simuladas de Potosí (-19.589366, -65.259119)
- WHEN selecciona Tipo de Corte 'PROTECCION', digita Lectura '1234' y pulsa 'Registrar corte efectivo'
- THEN la orden transiciona a estado 'EJECUTADO' y el modal se cierra

#### Scenario: Bypass de excepciones técnicas (BR-004 y BR-005)
- GIVEN el modal P-05 sin coordenadas GPS
- WHEN el usuario selecciona ¿Saltar Control de Coordenadas? 'SI' y ¿Saltar Control de Fotos? 'SI'
- AND digita la lectura
- WHEN pulsa 'Registrar corte efectivo'
- THEN el sistema permite guardar el corte sin bloquear por falta de evidencia física

---

### Requisito: Simulación Standalone y Estado en Memoria

El prototipo DEBE ser ejecutable abriendo boceto-mvp/index.html con file:// sin backend ni persistencia persistente.

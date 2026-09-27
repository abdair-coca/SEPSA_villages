# Tareas: Boceto MVP del Ecosistema SEPSA (Pantallas Operativas Reales)

## Fase 1: Limpieza y Estructura Base (boceto-mvp/index.html)

- [x] 1.1 Limpiar boceto-mvp/ eliminando el prototipo previo de cobranza rural.
- [x] 1.2 Construir boceto-mvp/index.html con la barra superior institucional de SEPSA (BASE DE DATOS OFICIAL, notificaciones, temporizador y usuario).
- [x] 1.3 Construir la estructura semantica de las 4 vistas web: view-dashboard (P-01), view-busqueda (P-02), view-bandeja (P-03), view-ficha (P-04).
- [x] 1.4 Construir el modal de corte efectivo modal-corte (P-05) con inputs tecnicos y switches de bypass.

## Fase 2: Estilos Visuales de Alta Fidelidad (boceto-mvp/styles.css)

- [x] 2.1 Replicar la paleta de colores oficial: verde institucional SEPSA, rojo de accion de corte (#c82333), azul (#0d6efd) y amarillo de temporizador (#ffc107).
- [x] 2.2 Disenar la tipografia, tarjetas de acceso rapido rojas/azules y tablas con cabeceras estilizadas identicas a la captura de pantalla.
- [x] 2.3 Estilizar el modal emergente centrado P-05 y los badges de estado semaforicos (GENERADO, EJECUTADO, ANULADO).

## Fase 3: Estado en Memoria y Logica Operativa (boceto-mvp/app.js)

- [x] 3.1 Declarar el store en memoria con los datos empiricos del video: perfil de Josue Daniel Quintanilla, 46 ordenes en bandeja, suministros de Mojotorillo (Pedro Munoz 306040) y detalle de 3 facturas de deuda FA_FACTURAS (66.82 Bs).
- [x] 3.2 Implementar el temporizador regresivo de sesion (arrancando en 6 min 18 seg) con actualizacion continua por segundo.
- [x] 3.3 Implementar el motor de navegacion SPA navigateTo(viewId, params).
- [x] 3.4 Implementar el filtrado en cascada en P-02 (Area Betanzos -> Localidad Mojotorillo -> Ruta 002) y la renderizacion de la tabla T-01.
- [x] 3.5 Implementar la accion Crear orden de corte que genera CUCs en estado GENERADO y redirige a P-03 actualizando el contador.
- [x] 3.6 Implementar la tabla de bandeja P-03 con calculo dinamico de dias_desde_generacion y navegacion a P-04 (Ver corte).
- [x] 3.7 Implementar la Ficha P-04 con despliegue de deuda, Dropzone simulado y disparador de simulacion de pago concurrente (BR-003) a ANULADO.
- [x] 3.8 Implementar el modal P-05 con captura simulada de coordenadas GPS, lectura final de medidor, validaciones y bypasses (Saltar Control de Fotos, Saltar Control de Coordenadas).

## Fase 4: Verificacion y Smoke Test

- [x] 4.1 Abrir boceto-mvp/index.html con protocolo file:// y confirmar que renderiza sin errores de consola.
- [x] 4.2 Probar el recorrido completo: Inicio -> Busqueda -> Crear Orden -> Bandeja -> Ficha -> Ejecutar Corte (P-01 a P-05).
- [x] 4.3 Probar la anulacion concurrente (BR-003) en P-04 y verificar la inhabilitacion del boton de corte.
- [x] 4.4 Probar los bypasses de GPS y fotos en P-05.

# Propuesta: Boceto MVP del Ecosistema SEPSA (Pantallas Operativas Reales)

## Propósito

Construir un prototipo interactivo standalone de alta fidelidad visual y funcional para escritorio que replique fielmente las pantallas operativas reales del módulo de cortes de SEPSA (cortes.sepsa.net.bo, pantallas P-01 a P-05), utilizando el conjunto de datos empíricos observado en el video y validando el ciclo transaccional completo en memoria volátil.

## Decisiones Clave Acordadas

1. **Ubicación**: Reemplazo total del contenido previo en oceto-mvp/.
2. **Ciclo de Vida del Estado**: Volátil en memoria (al recargar la página con F5 se restablece a los datos iniciales).
3. **Form Factor / Ergonomía**: Aplicación web de escritorio, calcada visualmente de la captura real de cortes.sepsa.net.bo (P-01 Dashboard y vistas asociadas). Versión móvil postergada para una fase posterior.
4. **Demostración de Anulación Concurrente (BR-003)**: Disparador directo de simulación en la Ficha de Corte (P-04) que transiciona la orden a ANULADO con timestamp y motivo formal.
5. **Conjunto de Datos (Mock Data)**: Clonación exacta de los datos observados en el video (Área: *B - BETANZOS*, Localidad: *002 - MOJOTORILLO*, Ruta: *002*, Cuenta *306040* de Pedro Muñoz, deuda de *66.82 Bs* en 3 facturas de *FA_FACTURAS*, medidor *WASION 240907792* y bandeja con *46 órdenes* en estado GENERADO).

## Alcance

### Incluido

- **P-01: Dashboard Principal**: Barra superior institucional (BASE DE DATOS OFICIAL), perfil de Josué Daniel Quintanilla Taboada (ID 680), temporizador regresivo dinámico, formulario de teléfono y tarjetas de acceso directo rojas y azules.
- **P-02: Búsqueda de Morosidad y Creación de Órdenes (/orden/create)**: Selectores en cascada (Área -> Localidad -> Ruta), umbral numérico de facturas (default 2), banner explicativo sin intereses, tabla T-01 de morosos y botón rojo 'Crear orden de corte'.
- **P-03: Bandeja de Registros para Cortar (/verCortes)**: Contador destacado de 46 órdenes, tabla T-02 con cálculo dinámico de días desde generación (dias_desde_generacion), filtros rápidos y botón 'Ver corte'.
- **P-04: Ficha Integral de Corte (/corte/{id})**: CUC, panel del suministro, tabla T-03 de detalle de deuda mensual (FA_FACTURAS), indicadores de salvaguarda (Sin reclamos, Sin plan de pago), zona Dropzone de 20 MB, paneles de auditoría inferiores, botón 'Registrar corte efectivo' y disparador de prueba para BR-003.
- **P-05: Modal Formulario de Registro de Corte Efectivo**: Técnico autoasignado, selector de Tipo de Corte (RED, MEDIDOR, BARRAS, PROTECCION, ACOMETIDA, FUSIBLES), input numérico de lectura final (kWh), switches de bypass administrativo (¿Saltar Control de Fotos?, ¿Saltar Control de Coordenadas?) y captura simulada de georreferenciación.
- **Ciclo Transaccional en Memoria**: Creación de órdenes en P-02 -> incorporación dinámica a P-03 -> ejecución material en P-05 (pasa a EJECUTADO) o anulación concurrente en P-04 (pasa a ANULADO).

### Excluido

- Versión móvil (postergada para siguiente etapa).
- Backend, base de datos persistente, localStorage o llamadas a APIs externas reales.
- Módulos administrativos no observados o facturación activa.

## Criterios de Éxito

- [ ] La interfaz calca la estética, paleta de colores y componentes visuales del screenshot real de SEPSA.
- [ ] Es posible ejecutar el flujo completo P-01 -> P-02 -> P-03 -> P-04 -> P-05 de forma fluida.
- [ ] La creación masiva de órdenes en P-02 agrega registros reales a la bandeja P-03.
- [ ] El modal P-05 permite registrar el corte o activar los bypasses de fotos/GPS, pasando la orden a EJECUTADO.
- [ ] El disparador de BR-003 en P-04 transiciona la orden a ANULADO e inhabilita el botón de corte en campo.
- [ ] Abre directamente mediante ile:// en cualquier navegador web moderno sin dependencias ni servidor.

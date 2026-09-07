---
title: "Componentes, Botones y Tablas del Sistema"
type: "ui"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "navigation.md"
  - "screens/P-02-delinquency-search.md"
  - "screens/P-03-cut-tray.md"
---

# Componentes, Botones y Tablas del Sistema

## 1. Botones y Acciones del Sistema

| Acción | Elemento Visual | Pantalla | Resultado | Nivel de Certeza |
| --- | --- | --- | --- | --- |
| Consultar Morosidad | Botón Buscar (azul) | P-02 | Filtra y renderiza tabla T-01. | [CONFIRMADO VISUALMENTE] |
| Emitir Lote de Corte | Botón Crear orden de corte (rojo) | P-02 | Genera registros en `ORDEN_CORTE` en estado GENERADO. | [CONFIRMADO VISUALMENTE] |
| Exportar Planillas | Botones Excel/PDF | P-02 | Descarga planillas de morosos al disco local. | [CONFIRMADO VISUALMENTE] |
| Ver Kardex Contable | Botón Ver Kardex | P-02, P-04 | Abre el Kardex P-06 en nueva pestaña. | [CONFIRMADO VISUALMENTE] |
| Filtrar Bandeja | Botón Buscar | P-03 | Aplica filtros en tabla T-02. | [CONFIRMADO VISUALMENTE] |
| Limpiar Filtros | Botón Limpiar Filtros | P-03 | Restablece selectores en P-03. | [CONFIRMADO VISUALMENTE] |
| Conmutar Mapa Web | Pestaña Mapa y detalles | P-03 | Despliega visualizador GIS web. | [CONFIRMADO VISUALMENTE] |
| Abrir Ficha Corte | Botón Ver corte | P-03 | Navega a `/corte/{id}` (P-04). | [CONFIRMADO VISUALMENTE] |
| Abrir Modal Corte | Botón Registrar corte efectivo | P-04 | Abre formulario modal P-05. | [CONFIRMADO VISUALMENTE] |
| Capturar Coordenadas | Botón Obtener ubicación | P-05 | Invoca API Geolocation del navegador. | [CONFIRMADO VISUALMENTE] |
| Confirmar Corte | Botón Registrar corte (modal) | P-05 | Persiste corte y transiciona a EJECUTADO. | [CONFIRMADO VISUALMENTE] |
| Cerrar Modal | Botón Cerrar | P-05 | Cierra modal sin cambios. | [CONFIRMADO VISUALMENTE] |
| Adjuntar Evidencias | Contenedor Dropzone | P-04 | Sube archivos de hasta 20 MB. | [CONFIRMADO VISUALMENTE] |
| Actualizar Teléfono | Botón Enviar | P-01 | Actualiza teléfono del usuario. | [CONFIRMADO VISUALMENTE] |

---

## 2. Tablas de Datos del Sistema

### Tabla T-01: Clientes Morosos Filtrados (Pantalla P-02)
- **Columnas**: `REGIONAL LOCALIDAD`, `HABILITANTE`, `CUENTA`, `NOMBRES`, `RUTA`, `ORDEN`, `CIRCUITO`, `DIRECCIÓN`, `ESTADO`, `TARIFA`, `MEDIDOR`, `FACTURAS > 30 DÍAS`, `TOTAL PENDIENTE`, `ACCIONES` (Botón Ver Kardex).

### Tabla T-02: Bandeja de Registros para Cortar (Pantalla P-03)
- **Columnas**: `CUENTA/MEDIDOR`, `ACCIÓN` (Ver corte), `TIT/HAB`, `ESTADO` (Badge GENERADO), `FECHA DE GENERACIÓN`, `DÍAS DESDE GENERACIÓN` (ej. 9.21 días), `DEUDA (MES TOPE)`, `TÉCNICO ASIGNADO`.
- **Paginación**: Paginador con selector de filas por página y contador total (46 registros).

### Tabla T-03: Detalle de Deuda de la Orden (Pantalla P-04)
- **Columnas**: `PERIODO`, `AÑO`, `FECHA FACTURACIÓN`, `MONTO` (Bs), `ESTADO` (`P` = Pendiente), `ORIGEN` (`FA_FACTURAS`), `DÍAS` (Mora: 63, 31).

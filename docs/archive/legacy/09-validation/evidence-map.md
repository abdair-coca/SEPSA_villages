---
title: "Línea Temporal de Evidencia en Video"
type: "validation"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "traceability.md"
---

# Línea Temporal de Evidencia en Video (`Diseño sin título.mp4`)

| Marca Temporal | Pantalla / Entorno | Acción Concreta | Elemento Crítico Demostrado |
| --- | --- | --- | --- |
| 00:00 - 00:39 | `cortes.sepsa.net.bo/dashboard` | Carga inicial, revisión de perfil de usuario 680 y temporizador de sesión. | Estructura de navegación principal y sesión activa. |
| 00:40 - 01:42 | `/orden/create` | Selección en cascada: Betanzos $ightarrow$ Mojotorillo $ightarrow$ Ruta 002. Prueba de umbral con 3 y 2 facturas. | Criterio de filtrado de mora $\ge 2$ facturas $> 30$ días. |
| 01:43 - 03:12 | `/orden/create` (Tabla) | Búsqueda exitosa con 2 resultados. Copia de cuenta 306040. | Datos de morosidad: montos, lecturas y titular MUÑOZ PEDRO. |
| 03:13 - 03:14 | `nexo.sepsa.bo` | Conmutación a pestaña NEXO (Mis asignaciones). | Verificación de despacho móvil sin órdenes asignadas. |
| 03:15 - 05:54 | `cobros.sepsa.web.bo/kardex` | Pegado de cuenta 306040. Salto de alerta de CI faltante y auditoría de facturas 2026. | Alerta fiscal, estados de pago P y C, lecturas kWh en Kardex. |
| 05:55 - 06:49 | `/orden` | Navegación a bandeja histórica con filtros de fechas. | Módulo maestro de control de órdenes. |
| 06:50 - 07:39 | `/verCortes` | Carga de bandeja con 46 órdenes activas, cálculo de días y saldos tope. | Estado GENERADO y cálculo dinámico de antigüedad. |
| 07:40 - 08:28 | `/corte/443797` | Ficha de cuenta 1702690. Modal de error GPS. Estado ANULADO. | Regla BR-003: Anulación automática por pago en ventanilla. |
| 08:29 - 09:20 | `/corte/443794` | Ficha activa de cuenta 1701603. Detalle de 3 planillas (66.82 Bs). | Confirmación del origen de deuda FA_FACTURAS. |
| 09:21 - 11:35 | `/corte/443794` (Modal) | Apertura de modal de corte efectivo, prueba de selector de tipo y bypass. | Formulario P-05: tipos de corte, lectura y bypass fotos/GPS. |
| 11:36 - 13:53 | `/corte/443794` (Ficha) | Inspección de Dropzone, error de consulta GIS y paneles inferiores. | Paneles de Reconexión, Suspensión y excepción SQL en GIS. |
| 13:54 - 16:55 | `/verCortes` (Mapa) | Revisión de pestaña geográfica web con capas de clientes. | Superposición de fuentes de coordenadas. |
| 16:56 - 19:11 | Búsqueda web / Meet | Búsqueda de QField y atención de llamada técnica. | Transición hacia la arquitectura móvil en terreno. |
| 19:12 - 21:24 | QField (`sis_dondiego`) | Navegación sobre imagen satelital con postes, trafos y etiquetas de mora. | Visualización espacial en campo (`C:361499 M:221009296`). |
| 21:25 - 26:46 | QField (`OBS-RAULEX`) | Despliegue del árbol completo de capas de distribución eléctrica. | Modelo geoespacial: transformadores, líneas MT/BT y estados. |

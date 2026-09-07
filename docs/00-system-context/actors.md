---
title: "Actores y Roles del Sistema"
type: "system-context"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "system-overview.md"
  - "../08-requirements/functional-requirements.md"
---

# Actores y Roles del Sistema

El ecosistema SEPSA involucra cuatro perfiles operativos claramente diferenciados en sus responsabilidades, entornos de trabajo y herramientas tecnológicas.

| Rol | Entorno Primario | Responsabilidades Principales | Evidencia Visual / Certeza |
| --- | --- | --- | --- |
| **Supervisor / Operador de Cortes** | Web (`cortes.sepsa.net.bo`) | Consulta de cartera vencida por filtros jerárquicos (Área/Localidad/Ruta), emisión masiva de órdenes en estado `GENERADO`, exportación de reportes Excel/PDF, monitoreo de bandeja de cortes y auditoría de trazabilidad. | [CONFIRMADO VISUALMENTE] (Operador JOSUE DANIEL QUINTANILLA TABOADA, ID 680) |
| **Técnico de Terreno / Liniero** | Móvil / Web (`cortes.sepsa.net.bo`, `nexo.sepsa.bo`, `QField`) | Navegación geográfica satelital hacia postes y medidores, inspección física, apertura de circuitos, captura de lectura final, registro de GPS, fotos de respaldo y ejecución de corte o reposición. | [CONFIRMADO VISUALMENTE] |
| **Cajero / Analista Comercial** | Web (`cobros.sepsa.web.bo`) | Atención en ventanilla de cobranzas, consulta del Kardex comercial por cuenta, gestión de alertas tributarias por falta de CI/NIT, cobro de facturas y liquidación de conceptos de reconexión. | [CONFIRMADO VISUALMENTE] (Caja SP-JDQT, SEPSA URBANO) |
| **Fiscalizador / Administrador GIS** | Escritorio / Móvil (`QGIS / QField`) | Mantenimiento de capas vectoriales de distribución (postes, transformadores, tramos BT/MT), clasificación temática de suministros con mora y auditoría de consistencia espacial. | [CONFIRMADO VISUALMENTE] (Proyectos sis_dondiego y OBS-RAULEX) |

---
title: "Criterios de Aceptación para Replicar el Sistema"
type: "requirements"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "functional-requirements.md"
  - "../../05-business-rules/README.md"
---

# Criterios de Aceptación para Replicar el Sistema

El sistema se considerará funcionalmente fiel al modelo analizado si cumple con los siguientes 8 criterios verificables:

- [ ] **1. Búsqueda Jerárquica**: Permite seleccionar en cascada Área $ightarrow$ Localidad $ightarrow$ Ruta y filtrar clientes activos con $\ge 2$ facturas vencidas con más de 30 días.
- [ ] **2. Emisión Masiva de Órdenes**: Permite crear órdenes en estado `GENERADO` asignando un C.U.C. unívoco y congelando el saldo en `deuda_mes_tope`.
- [ ] **3. Bandeja de Control**: Muestra el listado de cortes pendientes ordenados por días transcurridos (`DÍAS DESDE GENERACIÓN`) con paginación y búsqueda por cuenta/medidor.
- [ ] **4. Ficha 360°**: Despliega el resumen del cliente, medidor, panel de deuda mensual proveniente de `FA_FACTURAS`, y área Dropzone con límite de 20 MB.
- [ ] **5. Modal de Corte Efectivo**: Dispone de captura GPS del navegador, captura de lectura final, selección de método de corte (`RED`, `MEDIDOR`, `BARRAS`, `PROTECCION`, `ACOMETIDA`, `FUSIBLES`) y controles de bypass (`Saltar Fotos`, `Saltar Coordenadas`).
- [ ] **6. Anulación Concurrente**: Transiciona automáticamente a `ANULADO` la orden si se asienta el cobro de las planillas en ventanilla, registrando timestamp y causa.
- [ ] **7. Auditoría de Restablecimiento**: Dispone de campos para auditar fecha de reposición, liniero y modalidad de reconexión manual tras validar Otros Ingresos.
- [ ] **8. Integración Cartográfica**: Permite visualizar los suministros morosos sobre mapa satelital distinguiendo estados mediante capas vectoriales.

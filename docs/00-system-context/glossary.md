---
title: "Glosario Técnico y Comercial"
type: "system-context"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "system-overview.md"
  - "../01-domain/domain-overview.md"
---

# Glosario Técnico y Comercial

- **CUC (Código Único de Corte)**: Identificador numérico secuencial único asignado a cada orden de corte generada (ej. `443794`, `443797`). Funciona como clave primaria de la intervención.
- **Cuenta / Suministro**: Código numérico que identifica el contrato y punto de entrega de energía eléctrica del cliente (ej. `306040`, `1702690`).
- **Título Habilitante**: Clasificación regulatoria del derecho de prestación del servicio eléctrico (ej. valor `R` observado en pantallas).
- **Tarifa / Categoría**: Código de régimen tarifario aplicado al cliente (ej. `RS` = Residencial / Rural Social).
- **Kardex Comercial**: Registro contable y cronológico detallado de lecturas de medidor, consumos en kWh, facturas emitidas, estados de pago y fechas de recaudación de una cuenta.
- **FA_FACTURAS**: Sistema o tabla del núcleo de facturación comercial externo que provee la información histórica de planillas de energía.
- **Bandeja de Cortes (`/verCortes`)**: Vista consolidada donde se gestionan las órdenes en estado `GENERADO` pendientes de ejecución en campo.
- **Tipo de Corte**: Método físico utilizado para desenergizar el suministro: `RED`, `MEDIDOR`, `BARRAS`, `PROTECCION`, `ACOMETIDA`, `FUSIBLES`.
- **Bypass Administrativo**: Mecanismo de excepción en pantalla que permite confirmar un corte sin fotos (`saltar_control_fotos`) o sin GPS (`saltar_control_coordenadas`) ante fallas de cobertura o hardware.
- **Trafo / Transformador de Distribución**: Activo de red de media a baja tensión que alimenta a un conjunto de suministros en un circuito.
- **QField**: Aplicación móvil de código abierto basada en QGIS utilizada en campo para visualización cartográfica satelital offline.

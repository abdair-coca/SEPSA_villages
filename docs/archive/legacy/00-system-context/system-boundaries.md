---
title: "Límites y Fronteras del Sistema"
type: "system-context"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "system-overview.md"
  - "../02-modules/README.md"
  - "../09-validation/uncertainties.md"
---

# Límites y Fronteras del Sistema

## Subdominios del Ecosistema SEPSA

```text
SEPSA Ecosistema
├── [M1] cortes.sepsa.net.bo    # Gestión centralizada web de cortes y reposiciones
├── [M2] cobros.sepsa.web.bo    # Recaudación en ventanilla y Kardex comercial
├── [M3] nexo.sepsa.bo          # Operaciones en terreno y asignaciones móviles
└── [M4] QField / QGIS          # Cartografía SIG de infraestructura y suministros morosos
```

## Límites Funcionales e Integraciones Externas

1. **Núcleo de Facturación (`FA_FACTURAS`)**:
   - *Frontera*: La emisión mensual de facturas, cálculo tarifario y lectura cíclica periódica residen fuera del módulo de cortes. El sistema de cortes consume `FA_FACTURAS` en modalidad de lectura.
   - *Riesgo*: Acoplamiento indebido si se intenta replicar la facturación dentro del módulo de cortes.
2. **Sistema de Cobranza en Ventanilla / Bancos**:
   - *Frontera*: La recaudación monetaria física se realiza en `cobros.sepsa.web.bo` o entidades bancarias.
   - *Integración*: Debe disparar eventos o triggers hacia `cortes.sepsa.net.bo` para ejecutar la regla `BR-003` (anulación automática).
3. **Servicios de Ubicación del Dispositivo**:
   - *Frontera*: El frontend web consume la API estándar HTML5 `navigator.geolocation`.
   - *Dependencia*: Requiere permisos del navegador; si es denegado, bloquea el flujo salvo activación del flag de bypass.
4. **Almacenamiento de Evidencias (Dropzone)**:
   - *Frontera*: Acepta archivos de hasta 20 MB (.pdf, .doc, .docx, .jpg, .png). El almacenamiento persistente de binarios reside en un sistema de archivos o bucket seguro.

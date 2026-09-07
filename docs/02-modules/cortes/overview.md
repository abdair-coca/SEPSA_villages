---
title: "M1: Gestión de Cortes y Reposiciones"
type: "module"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../07-ui/screens/P-01-dashboard.md"
  - "../../07-ui/screens/P-02-delinquency-search.md"
  - "../../07-ui/screens/P-03-cut-tray.md"
  - "../../07-ui/screens/P-04-cut-file.md"
  - "../../07-ui/screens/P-05-cut-execution-modal.md"
---

# M1: Gestión de Cortes y Reposiciones (`cortes.sepsa.net.bo`)

## Propósito

Constituye la aplicación web central utilizada por supervisores y técnicos para gobernar el ciclo de vida de las órdenes de suspensión por mora.

## Pantallas Pertenecientes

1. **[P-01 Dashboard Principal](../../07-ui/screens/P-01-dashboard.md)** (`/dashboard`): Control central, temporizador de sesión y accesos rápidos.
2. **[P-02 Búsqueda de Morosidad](../../07-ui/screens/P-02-delinquency-search.md)** (`/orden/create`): Filtros jerárquicos territoriales y emisión masiva.
3. **[P-03 Bandeja de Registros](../../07-ui/screens/P-03-cut-tray.md)** (`/verCortes`): Monitoreo de 46 órdenes activas, cálculo de días y mapa web.
4. **[P-04 Ficha Integral de Corte](../../07-ui/screens/P-04-cut-file.md)** (`/corte/{id}`): Ficha 360°, deuda `FA_FACTURAS`, Dropzone de 20MB y auditorías.
5. **[P-05 Modal Registro de Corte](../../07-ui/screens/P-05-cut-execution-modal.md)**: Captura de GPS, tipo de corte, lectura y bypasses.

## Capacidades Funcionales

- Consulta en cascada de suministros morosos con $\ge 2$ facturas $> 30$ días.
- Emisión masiva de órdenes con asignación de CUC y congelamiento de deuda tope.
- Registro móvil de ejecución material en terreno.
- Recepción de eventos de anulación por pago en ventanilla.

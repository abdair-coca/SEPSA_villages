---
title: "Matriz de Relaciones entre Entidades"
type: "domain"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "domain-overview.md"
  - "../06-data-model/er-diagram.md"
---

# Matriz de Relaciones entre Entidades

| Entidad Origen | Card. | Relación | Entidad Destino | Justificación y Evidencia Visual | Nivel de Certeza |
| --- | --- | --- | --- | --- | --- |
| `CLIENTE` | 1:N | posee | `CUENTA_SUMINISTRO` | Un cliente puede tener varios suministros. El Kardex muestra titular y cuenta por separado. | [ALTAMENTE INFERIDO] |
| `UBICACION_TECNICA` | 1:N | localiza | `CUENTA_SUMINISTRO` | Una ruta agrupa múltiples cuentas (ej. Mojotorillo contiene cuentas 306040 y 306043). | [CONFIRMADO VISUALMENTE] |
| `CUENTA_SUMINISTRO` | 1:1 | tiene_instalado | `MEDIDOR` | Cada cuenta tiene un único medidor activo asociado en la ficha técnica. | [CONFIRMADO VISUALMENTE] |
| `CUENTA_SUMINISTRO` | 1:N | adeuda | `FACTURA_DEUDA` | El panel de deuda muestra 3 periodos (2026/6, 2026/7, 2026/8) para una misma cuenta. | [CONFIRMADO VISUALMENTE] |
| `CUENTA_SUMINISTRO` | 1:N | sujeta_a | `ORDEN_CORTE` | Una cuenta recibe órdenes de corte a lo largo del tiempo. | [CONFIRMADO VISUALMENTE] |
| `ORDEN_CORTE` | 1:1 | se_ejecuta_en | `EJECUCION_CORTE` | El modal de corte efectivo captura los datos técnicos de cierre de esa orden puntual. | [ALTAMENTE INFERIDO] |
| `ORDEN_CORTE` | 1:1 | audita_baja | `SUSPENSION_REGISTRO` | Panel de auditoría de inhabilitación administrativa vinculado a la orden. | [CONFIRMADO VISUALMENTE] |
| `ORDEN_CORTE` | 1:1 | se_restablece_en | `REHABILITACION_RECONEXION` | Panel de reposición asociado a la misma orden tras el pago de la deuda. | [CONFIRMADO VISUALMENTE] |
| `ORDEN_CORTE` | 1:N | contiene | `ADJUNTO_CORTE` | El área Dropzone permite subir múltiples archivos por orden. | [ALTAMENTE INFERIDO] |
| `USUARIO_SISTEMA` | 1:N | asigna | `ORDEN_CORTE` | La columna TÉCNICO ASIGNADO vincula al operario con la orden. | [CONFIRMADO VISUALMENTE] |

---
title: "Visión del Dominio del Negocio"
type: "domain"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "relationships.md"
  - "entities/account.md"
  - "../06-data-model/data-model-overview.md"
---

# Visión del Dominio del Negocio (SEPSA)

El negocio de distribución eléctrica de SEPSA en Potosí se articula sobre 6 conceptos estructurales que vinculan la ingeniería de redes con la gestión comercial y financiera:

```
[INFRAESTRUCTURA GIS] ---> [UBICACIÓN TÉCNICA] ---> [CUENTA / SUMINISTRO] <---> [CLIENTE]
                                                            |
                                               +------------+------------+
                                               |                         |
                                        [MEDIDOR ACTIVO]          [CARTERA MOROSA]
                                                                  (Facturas impagas)
                                                                         |
                                                                         v
                                                                 [ORDEN DE CORTE]
                                                                         |
                                               +-------------------------+-------------------------+
                                               |                                                   |
                                       [EJECUCIÓN MATERIAL]                                [REHABILITACIÓN]
                                       (Corte en terreno)                                  (Reconexión post-pago)
```

1. **Suministro (Cuenta)**: Eje central técnico y comercial. Representa el punto de entrega de energía donde se presta el servicio bajo una categoría tarifaria y circuito eléctrico determinado.
2. **Activo de Medición (Medidor)**: Equipo electromecánico o electrónico (ej. marca WASION) que registra el consumo en kWh, vinculado unívocamente a una cuenta.
3. **Cartera Morosa (Deuda / Factura)**: Obligaciones financieras mensuales impagas provenientes del módulo `FA_FACTURAS`. El umbral regulatorio activa la emisión de corte con $\ge 2$ facturas con mora $> 30$ días.
4. **Suspensión Material (Orden y Ejecución)**: Acción administrativa y física de desenergizar el punto de entrega (en red, acometida, medidor o protección) para detener el consumo no cancelado.
5. **Restablecimiento (Rehabilitación / Reconexión)**: Acción física y contable de reponer el servicio una vez subsanada la causa de la mora y liquidados los derechos de reconexión ("Otros Ingresos").
6. **Infraestructura de Distribución (Red GIS)**: Conjunto de transformadores, postes, líneas de Media Tensión (MT) y tramos de Baja Tensión (BT) que alimentan geográficamente los suministros.

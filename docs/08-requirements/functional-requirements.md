---
title: "Requerimientos Funcionales y Casos de Uso"
type: "requirements"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "acceptance-criteria.md"
  - "../../03-features/README.md"
---

# Requerimientos Funcionales y Casos de Uso

## UC-001: Filtrar Clientes Morosos por Jerarquía Territorial
- **Actor**: Supervisor de Cortes.
- **Flujo**: Accede a `/orden/create` $ightarrow$ Selecciona Área Regional $ightarrow$ Localidad $ightarrow$ Ruta $ightarrow$ Define umbral de facturas ($\ge 2$) $ightarrow$ Pulsa Buscar $ightarrow$ Renderiza tabla `T-01`.
- **Validación**: Dependencia estricta en cascada; exclusión de clientes inactivos o con menos de 2 facturas $> 30$ días.

## UC-002: Registrar Ejecución Material de Corte
- **Actor**: Liniero en Terreno.
- **Flujo**: Accede a `/corte/{id}` $ightarrow$ Pulsa "Registrar corte efectivo" $ightarrow$ Modal P-05 $ightarrow$ Captura GPS $ightarrow$ Digita lectura final en kWh $ightarrow$ Selecciona tipo de corte $ightarrow$ Guarda.
- **Validación**: Si no hay GPS o cámara, permite activar flags de bypass (`saltar_control_coordenadas`, `saltar_control_fotos`).

## UC-003: Auditoría y Cobro en Kardex Comercial
- **Actor**: Cajero / Operador Comercial.
- **Flujo**: Ingresa a `/kardex` $ightarrow$ Digita cuenta $ightarrow$ Modal de alerta si falta CI/NIT $ightarrow$ Audita historial de facturas $ightarrow$ Procesa pago.
- **Validación**: Al cobrar facturas vencidas, notifica de inmediato al sistema de cortes para transicionar la orden a `ANULADO`.

## Validaciones y Restricciones Específicas Observadas
1. **Permiso de Geolocalización**: Frontend solicita acceso imperativo al entrar a `/corte/{id}`; si es denegado, modal alerta: *"Permiso denegado. Por favor, habilite la ubicación..."*.
2. **Restricción de Adjuntos**: Dropzone restringe a 20 MB por archivo y tipos `.pdf`, `.doc`, `.docx`, `.jpg`, `.png`.
3. **Formato de Lectura**: Campo numérico para lecturas de kWh acumulados (placeholder: `1234567`).

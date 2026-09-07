---
title: "Feature F-001: Filtrado de Morosidad por Jerarquía Territorial"
type: "feature"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../05-business-rules/BR-001-minimum-threshold.md"
  - "../../05-business-rules/BR-002-interest-exclusion.md"
  - "../../07-ui/screens/P-02-delinquency-search.md"
---

# F-001: Filtrado de Morosidad por Jerarquía Territorial

## Objetivo

Permitir al supervisor filtrar suministros con deudas críticas mediante selectores en cascada correspondientes a la estructura de distribución eléctrica de SEPSA.

## Actor

Supervisor / Operador de Cortes.

## Precondiciones

Sesión activa en `cortes.sepsa.net.bo`.

## Parámetros de Entrada

- **Área Regional**: Select obligatorio (ej. `B` - BETANZOS).
- **Localidad**: Select obligatorio dependiente de Área (ej. `002` - MOJOTORILLO).
- **Ruta**: Select obligatorio dependiente de Localidad (ej. `002`).
- **Cantidad de facturas pendientes vencidas**: Number spinner (default `2`).
- **Estados de cliente**: Multi-select (token `Activos (A)`).

## Flujo Principal

1. El operador selecciona Área Regional $ightarrow$ El sistema puebla Localidades.
2. El operador selecciona Localidad $ightarrow$ El sistema puebla Rutas.
3. El operador define la Ruta y el umbral de facturas ($\ge 2$).
4. Pulsa el botón "Buscar".
5. El sistema consulta `FA_FACTURAS` y `CUENTA_SUMINISTRO`, renderizando la tabla `T-01` con totales sin intereses.

## Reglas Relacionadas

- [BR-001: Umbral Mínimo para Emisión de Corte](../../05-business-rules/BR-001-minimum-threshold.md)
- [BR-002: Exclusión de Intereses en Listados](../../05-business-rules/BR-002-interest-exclusion.md)

## Criterios de Aceptación

- [ ] Selección en cascada obligatoria: Localidad deshabilitada hasta elegir Área; Ruta deshabilitada hasta elegir Localidad.
- [ ] Solo se retornan cuentas activas (`A`) con al menos el número de facturas configurado cuya fecha de emisión supere 30 días.
- [ ] Los montos mostrados no incorporan intereses variables diarios.

## Casos de Prueba Potenciales (TDD)

- `TC-F001-01`: Cargar localidades al seleccionar Área 'B'.
- `TC-F001-02`: Excluir cuentas con solo 1 factura vencida si el umbral es 2.
- `TC-F001-03`: Excluir cuentas con facturas vencidas con menos de 30 días de antigüedad.
- `TC-F001-04`: Retornar resultado vacío amigable si no hay morosos en la ruta.

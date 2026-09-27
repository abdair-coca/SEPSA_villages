# Asignaciones y órdenes

## Objetivo

Permitir que un administrador encuentre un suministro moroso, cree una orden de corte y la asigne a un técnico sin duplicar trabajo ni perder historial.

## Flujo

1. Administrador autenticado consulta morosos con filtros disponibles.
2. Revisa contexto, deuda y existencia de una orden activa.
3. Crea una orden individual y selecciona técnico.
4. El backend valida rol, duplicados e identidad de técnico.
5. El técnico descarga únicamente su paquete asignado.
6. Creación, asignación y cambios quedan auditados.

## Reglas

- La orden conserva origen, creador, suministro, técnico, versión, estado y contexto.
- Una orden activa existente se consulta; no se crea otra para el mismo propósito.
- Asignación usa versión esperada e identificador de operación para evitar sobrescrituras.
- La creación masiva requiere selección, vista previa, confirmación, lote idempotente y deduplicación; es posterior a validar la orden individual.

## Componentes involucrados

- Admin UI: búsqueda, selección, modal de creación/asignación y detalle.
- Backend provisional: consulta, creación, asignación y auditoría.
- Dominio: permisos, transición y unicidad operativa.

## Casos especiales

Pago concurrente, conflicto de versión, técnico inválido, suministro inexistente o fallo posterior a la creación requieren conservar el resultado y pedir revisión; nunca repetir creación automáticamente.

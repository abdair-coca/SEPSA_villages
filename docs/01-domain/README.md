---
title: "Modelo de Dominio SEPSA"
type: "domain"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../README.md"
  - "domain-overview.md"
  - "relationships.md"
---

# 01 - Modelo de Dominio

Esta sección contiene la especificación formal del modelo de dominio de distribución y comercialización eléctrica de SEPSA, estructurado en entidades independientes de negocio y sus relaciones estructurales.

## Entidades de Dominio Disponibles

- [domain-overview.md](domain-overview.md): Visión global de los conceptos del negocio eléctrico.
- [relationships.md](relationships.md): Matriz exhaustiva de cardinalidades, claves y relaciones.
- **Entidades Atómicas:**
  - [entities/account.md](entities/account.md): `CUENTA_SUMINISTRO` (Eje contractual y técnico de entrega de energía).
  - [entities/customer.md](entities/customer.md): `CLIENTE` (Titular del contrato y datos de contacto).
  - [entities/meter.md](entities/meter.md): `MEDIDOR` (Activo de medición de energía kWh).
  - [entities/cut-order.md](entities/cut-order.md): `ORDEN_CORTE` (Orden administrativa de suspensión de servicio).
  - [entities/cut-execution.md](entities/cut-execution.md): `EJECUCION_CORTE` (Datos técnicos de la intervención material).
  - [entities/debt-invoice.md](entities/debt-invoice.md): `FACTURA_DEUDA` (Detalle mensual de planillas impagas `FA_FACTURAS`).
  - [entities/technical-location.md](entities/technical-location.md): `UBICACION_TECNICA` (Área, Localidad, Ruta, Orden y Coordenadas).
  - [entities/system-user.md](entities/system-user.md): `USUARIO_SISTEMA` (Operadores, linieros y cajeros del sistema).
  - [entities/reconnection.md](entities/reconnection.md): `REHABILITACION_RECONEXION` (Auditoría de reposición de energía).
  - [entities/suspension-audit.md](entities/suspension-audit.md): `SUSPENSION_REGISTRO` (Auditoría administrativa de baja).
  - [entities/cut-attachment.md](entities/cut-attachment.md): `ADJUNTO_CORTE` (Fotografías y documentos de respaldo).
  - [entities/gis-infrastructure.md](entities/gis-infrastructure.md): `INFRAESTRUCTURA_RED_GIS` (Postes, transformadores y circuitos).

---
title: "Diccionario Completo de Campos Atómicos"
type: "data-model"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "data-model-overview.md"
  - "er-diagram.md"
---

# Diccionario Completo de Campos Atómicos (C-01 a C-51)

| ID | Campo / Label visible | Pantallas | Módulo | Tipo aparente | Editable | Oblig. | Entidad Asociada | Certeza |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | ID / Usuario | P-01, P-03, P-04 | M1 | Integer (ej. 680) | No | Sí | USUARIO_SISTEMA | [CONFIRMADO VISUALMENTE] |
| C-02 | CI (Operador) | P-01 | M1 | String (10577452) | No | Sí | USUARIO_SISTEMA | [CONFIRMADO VISUALMENTE] |
| C-03 | Nombre Operador | P-01, P-03, P-05 | M1 | String | No | Sí | USUARIO_SISTEMA | [CONFIRMADO VISUALMENTE] |
| C-04 | Email Operador | P-01 | M1 | String | No | Sí | USUARIO_SISTEMA | [CONFIRMADO VISUALMENTE] |
| C-05 | Teléfono Operador | P-01 | M1 | String | Sí | No | USUARIO_SISTEMA | [CONFIRMADO VISUALMENTE] |
| C-06 | Área Regional | P-02, P-03 | M1 | String / Code (B) | Sí | Sí | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-07 | Localidad | P-02 | M1 | String / Code (002) | Sí | Sí | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-08 | Ruta | P-02, P-03 | M1 | String / Code (002) | Sí | Sí | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-09 | Orden en Ruta | P-02 (Tabla) | M1 | Integer (ej. 129) | No | No | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-10 | Circuito | P-02, P-06 | M1, M2 | String (D-1182) | No | No | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-11 | Dirección | P-02, P-04 | M1 | Text | No | No | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-12 | Latitud Catastro | P-04, P-08 | M1, M4 | Decimal | No | No | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-13 | Longitud Catastro | P-04, P-08 | M1, M4 | Decimal | No | No | UBICACION_TECNICA | [CONFIRMADO VISUALMENTE] |
| C-14 | Cuenta | Transversal | Todos | Integer (ej. 306040) | No | Sí | CUENTA_SUMINISTRO | [CONFIRMADO VISUALMENTE] |
| C-15 | Nombres Consumidor | P-02, P-04, P-06 | M1, M2 | String | No | Sí | CLIENTE | [CONFIRMADO VISUALMENTE] |
| C-16 | CI / NIT Cliente | P-06 (Alerta) | M2 | String | Sí | No | CLIENTE | [CONFIRMADO VISUALMENTE] |
| C-17 | Teléfono Contacto | P-04, P-05 | M1 | String | Sí | No | CLIENTE | [CONFIRMADO VISUALMENTE] |
| C-18 | Tarifa / Categoría | P-02, P-04, P-06 | M1, M2 | String (RS) | No | Sí | CUENTA_SUMINISTRO | [CONFIRMADO VISUALMENTE] |
| C-19 | Estado Suministro | P-02, P-06 | M1, M2 | Char (A = Activo) | No | Sí | CUENTA_SUMINISTRO | [CONFIRMADO VISUALMENTE] |
| C-20 | Título Habilitante | P-02, P-03 | M1 | String (R) | No | No | CUENTA_SUMINISTRO | [CONFIRMADO VISUALMENTE] |
| C-21 | Número Medidor | Transversal | Todos | String (240907792) | No | Sí | MEDIDOR | [CONFIRMADO VISUALMENTE] |
| C-22 | Marca Medidor | P-02, P-06 | M1, M2 | String (WASION) | No | No | MEDIDOR | [CONFIRMADO VISUALMENTE] |
| C-23 | Multiplicador | P-06 | M2 | Integer (valor 1) | No | Sí | MEDIDOR | [CONFIRMADO VISUALMENTE] |
| C-24 | Índice de Medidor | P-04 | M1 | String | No | No | MEDIDOR | [CONFIRMADO VISUALMENTE] |
| C-25 | Nro. Registro / CUC | P-03, P-04 | M1 | Integer (443794) | No | Sí | ORDEN_CORTE | [CONFIRMADO VISUALMENTE] |
| C-26 | Fecha Generación | P-03, P-04 | M1 | DateTime | No | Sí | ORDEN_CORTE | [CONFIRMADO VISUALMENTE] |
| C-27 | Estado de Corte | P-03, P-04 | M1 | Enum (GENERADO, etc) | No | Sí | ORDEN_CORTE | [CONFIRMADO VISUALMENTE] |
| C-28 | Deuda Mes Tope | P-03, P-04 | M1 | Decimal en Bs | No | Sí | ORDEN_CORTE | [CONFIRMADO VISUALMENTE] |
| C-29 | Días Transcurridos | P-03 | M1 | Decimal (9.21 días) | No | No | ORDEN_CORTE (Calc) | [CONFIRMADO VISUALMENTE] |
| C-30 | Técnico Asignado | P-03, P-04 | M1 | String / Integer | No | No | ORDEN_CORTE | [CONFIRMADO VISUALMENTE] |
| C-31 | Motivo Anulación | P-04 (corte 443797) | M1 | Text | No | No | ORDEN_CORTE | [CONFIRMADO VISUALMENTE] |
| C-32 | Tipo de Corte | P-04, P-05 | M1 | Enum (PROTECCION, etc)| Sí | Sí | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-33 | Lectura del Corte | P-04, P-05 | M1 | Decimal / Entero | Sí | Sí | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-34 | Medidores Cercanos | P-04, P-05 | M1 | Boolean (SI/NO) | Sí | Sí | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-35 | Saltar Fotos | P-05 | M1 | Boolean (SI/NO) | Sí | Sí | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-36 | Saltar Coordenadas | P-05 | M1 | Boolean (SI/NO) | Sí | Sí | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-37 | Latitud Ejecución | P-05 | M1 | Decimal GPS WGS84 | Sí | No | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-38 | Longitud Ejecución | P-05 | M1 | Decimal GPS WGS84 | Sí | No | EJECUCION_CORTE | [CONFIRMADO VISUALMENTE] |
| C-39 | Periodo Mes Deuda | P-04 (Deuda) | M1 | Integer (6, 7, 8) | No | Sí | FACTURA_DEUDA | [CONFIRMADO VISUALMENTE] |
| C-40 | Periodo Año Deuda | P-04 (Deuda) | M1 | Integer (2026) | No | Sí | FACTURA_DEUDA | [CONFIRMADO VISUALMENTE] |
| C-41 | Fecha Facturación | P-04 (Deuda) | M1 | DateTime | No | Sí | FACTURA_DEUDA | [CONFIRMADO VISUALMENTE] |
| C-42 | Monto Factura | P-04 (Deuda) | M1 | Decimal (21.94 Bs) | No | Sí | FACTURA_DEUDA | [CONFIRMADO VISUALMENTE] |
| C-43 | Estado Cobro Fact. | P-04 (Deuda) | M1 | Char (P = Pendiente) | No | Sí | FACTURA_DEUDA | [CONFIRMADO VISUALMENTE] |
| C-44 | Origen Factura | P-04 (Deuda) | M1 | String (FA_FACTURAS) | No | Sí | FACTURA_DEUDA | [CONFIRMADO VISUALMENTE] |
| C-45 | Días Mora Factura | P-04 (Deuda) | M1 | Integer (63, 31) | No | No | FACTURA_DEUDA (Calc) | [CONFIRMADO VISUALMENTE] |
| C-46 | Es Reconexión Man. | P-04 (Reconexión) | M1 | Boolean | No | No | REHABILITACION_RECONEXION | [CONFIRMADO VISUALMENTE] |
| C-47 | Fecha Reposición | P-04 (Reconexión) | M1 | DateTime | No | No | REHABILITACION_RECONEXION | [CONFIRMADO VISUALMENTE] |
| C-48 | Técnico Reposición | P-04 (Reconexión) | M1 | String | No | No | REHABILITACION_RECONEXION | [CONFIRMADO VISUALMENTE] |
| C-49 | Fecha Suspensión | P-04 (Suspensión) | M1 | DateTime | No | No | SUSPENSION_REGISTRO | [CONFIRMADO VISUALMENTE] |
| C-50 | Código de Poste | P-08, P-09 | M4 | String (139, 026) | No | No | ESTRUCTURA_SOPORTE_GIS | [CONFIRMADO VISUALMENTE] |
| C-51 | ID Transformador | P-08, P-09 | M4 | String | No | No | TRANSFORMADOR_GIS | [CONFIRMADO VISUALMENTE] |

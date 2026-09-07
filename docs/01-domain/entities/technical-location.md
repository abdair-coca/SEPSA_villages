---
title: "Entidad: Ubicación Técnica"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "account.md"
  - "gis-infrastructure.md"
---

# Ubicación Técnica (`UBICACION_TECNICA`)

## Propósito

Estructura el territorio de distribución eléctrica bajo una jerarquía normalizada para permitir el filtrado y agrupamiento eficiente de cortes por rutas operativas.

## Descripción

La jerarquía territorial se divide en **Área Regional** (ej. `B` - BETANZOS, `P` - POTOSÍ), **Localidad** (ej. `002` - MOJOTORILLO), **Ruta** (ej. `002`), **Orden de recorrido** (posición numérica en el itinerario de lectura/corte), dirección textual y coordenadas catastrales.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `ruta_codigo` | Varchar(20) [PK] | Código compuesto de la ruta | Clave Primaria territorial | [CONFIRMADO VISUALMENTE] |
| `area_codigo` | Varchar(10) | Código de la regional | Ej. 'B', 'P' | [CONFIRMADO VISUALMENTE] |
| `localidad_codigo` | Varchar(10) | Código de la localidad | Ej. '002' | [CONFIRMADO VISUALMENTE] |
| `orden_recorrido` | Integer | Secuencia de visita física en calle | Secuencial numérico (ej. 129) | [CONFIRMADO VISUALMENTE] |
| `direccion_texto` | Text | Dirección catastral descriptiva | Texto libre | [CONFIRMADO VISUALMENTE] |
| `latitud_catastro` | Decimal(11,8) | Latitud registrada en catastro | Grados WGS84 | [CONFIRMADO VISUALMENTE] |
| `longitud_catastro`| Decimal(11,8) | Longitud registrada en catastro | Grados WGS84 | [CONFIRMADO VISUALMENTE] |

## Relaciones

- Agrupa a múltiples `CUENTA_SUMINISTRO` (1:N).

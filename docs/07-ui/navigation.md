---
title: "Mapa de Navegación Global"
type: "ui"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "README.md"
  - "screens/P-01-dashboard.md"
---

# Mapa de Navegación Global

## Matriz de Transiciones de Navegación

| Pantalla Origen | Acción Realizada | Elemento Utilizado | Pantalla Destino |
| --- | --- | --- | --- |
| P-01: Dashboard | Clic en tarjeta "Búsqueda de Morosidad / Crear orden" | Tarjeta UI con enlace | P-02: Búsqueda `/orden/create` |
| P-01: Dashboard | Clic en tarjeta "Ver Registros para Cortar (Con mapa)" | Tarjeta UI con enlace | P-03: Bandeja `/verCortes` |
| P-02: Búsqueda Morosos | Clic en botón "Ver Kardex" de una fila | Botón de acción en tabla | P-06: Kardex Cobros (nueva pestaña) |
| P-02: Búsqueda Morosos | Clic en "Crear orden de corte" tras filtros | Botón rojo destacado | P-03: Bandeja `/verCortes` |
| P-03: Bandeja `/verCortes` | Clic en botón "Ver corte" de un registro | Botón en columna Acción | P-04: Ficha `/corte/{id}` |
| P-04: Ficha de Corte | Clic en botón rojo "Registrar corte efectivo" | Botón de acción principal | P-05: Modal Registro Corte Efectivo |
| P-04: Ficha de Corte | Clic en botón superior "Ver Kardex" | Botón en toolbar superior | P-06: Kardex Cobros (nueva pestaña) |
| P-04: Ficha de Corte | Clic en botón superior "Actualizar" | Botón en toolbar superior | P-04: Ficha de Corte (Recarga) |
| P-05: Modal Reg. Corte | Clic en botón "Cerrar" | Botón secundario modal | P-04: Ficha de Corte |
| Navegador Web | Apertura de app móvil en campo | Cambio de dispositivo | P-08: QField Proyecto Móvil |

## Diagrama de Navegación Global (Mermaid)

```mermaid
graph TD
    classDef web fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
    classDef modal fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef ext fill:#f3e5f5,stroke:#4a148c,stroke-width:2px;
    classDef mobile fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;

    P01["P-01: Dashboard Principal<br/>(cortes.sepsa.net.bo)"]:::web
    P02["P-02: Búsqueda Morosos / Crear Orden<br/>(/orden/create)"]:::web
    P03["P-03: Registros para Cortar<br/>(/verCortes)"]:::web
    P04["P-04: Ficha Integral de Corte<br/>(/corte/{id})"]:::web
    P05["P-05: Modal Registro Corte Efectivo"]:::modal
    P06["P-06: Kardex Cliente<br/>(cobros.sepsa.web.bo)"]:::ext
    P07["P-07: Nexo Asignaciones<br/>(nexo.sepsa.bo)"]:::ext
    P08["P-08: Cartografía Terreno<br/>(QField sis_dondiego)"]:::mobile
    P09["P-09: Árbol Capas SIG<br/>(QField OBS-RAULEX)"]:::mobile

    P01 -->|Clic Tarjeta Morosidad| P02
    P01 -->|Clic Tarjeta Registros| P03
    P01 -.->|Navegación Externa| P07
    P02 -->|Crear Orden / Búsqueda| P03
    P02 -->|Botón Ver Kardex| P06
    P03 -->|Botón Ver Corte| P04
    P04 -->|Botón Registrar Corte| P05
    P04 -->|Botón Ver Kardex| P06
    P05 -->|Cerrar Modal| P04
    P08 <-->|Inspección Capas| P09
    P03 -.->|Sincronización Coordenadas| P08
```

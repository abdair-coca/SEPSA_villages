---
title: "Base de Conocimiento del Sistema SEPSA"
type: "system-context"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "00-system-context/system-overview.md"
  - "01-domain/domain-overview.md"
  - "06-data-model/data-model-overview.md"
---

# Base de Conocimiento — Ecosistema SEPSA (Cortes, Reconexiones y Gestión Comercial)

## Propósito

Esta base de conocimiento modular y semántica documenta en profundidad la arquitectura funcional, modelo de dominio, flujos transaccionales, interfaces de usuario y reglas de negocio del **Ecosistema Integrado de Cortes, Reconexiones y Gestión Comercial de Servicios Eléctricos Potosí S.A. (SEPSA, Bolivia)**.

Ha sido diseñada específicamente para permitir navegación y consumo eficiente por **LLMs, Coding Agents, arquitectos de software, desarrolladores humanos y sistemas RAG**, sirviendo como base directa para procesos de **Specification Driven Development (SDD)** y **Test Driven Development (TDD)** sin necesidad de procesar documentos monolíticos ni inventar requerimientos.

---

## Cómo Navegar Esta Base de Conocimiento

La documentación se organiza bajo el principio de **alta cohesión y bajo acoplamiento semántico**: cada archivo responde una única pregunta clara del sistema y contiene enlaces relativos a sus dependencias directas.

```
docs/
├── README.md                      # Este índice central
├── 00-system-context/             # Visión macro, actores, glosario y límites
├── 01-domain/                     # Modelo de dominio y entidades atómicas
│   └── entities/                  # Especificación exhaustiva por entidad
├── 02-modules/                    # Los 4 macro-módulos del ecosistema SEPSA
├── 03-features/                   # Funcionalidades aisladas para SDD
├── 04-flows/                      # Flujos transaccionales end-to-end (secuencias)
├── 05-business-rules/             # Reglas de negocio catalogadas (BR-001 a BR-008)
├── 06-data-model/                 # Diccionario de campos, ERD, estados y ciclo de vida
├── 07-ui/                         # Navegación, componentes y fichas de pantallas (P-01 a P-09)
├── 08-requirements/               # Requerimientos funcionales, no funcionales y criterios de aceptación
├── 09-validation/                 # Matriz de trazabilidad, evidencia temporal, riesgos e incertidumbres
└── 10-development/                # Decisiones de arquitectura, guía SDD y guía TDD
```

---

## Índice Principal de Acceso Rápido

### 1. Contexto del Sistema
- [Visión General del Sistema](00-system-context/system-overview.md): Qué resuelve el ecosistema y componentes clave.
- [Propósito y Objetivos](00-system-context/system-purpose.md): Justificación operativa y valor de negocio.
- [Actores y Roles](00-system-context/actors.md): Supervisor, Liniero en terreno, Cajero comercial y Fiscalizador GIS.
- [Glosario Técnico](00-system-context/glossary.md): Términos normativos y comerciales (CUC, FA_FACTURAS, Trafo, etc.).
- [Límites del Sistema](00-system-context/system-boundaries.md): Qué abarca la solución y qué interfaces son externas.

### 2. Dominio y Entidades
- [Visión del Dominio](01-domain/domain-overview.md): Conceptos centrales de distribución y comercialización eléctrica.
- [Catálogo de Entidades](01-domain/README.md):
  - [Cuenta / Suministro](01-domain/entities/account.md) (`CUENTA_SUMINISTRO`)
  - [Cliente Titular](01-domain/entities/customer.md) (`CLIENTE`)
  - [Medidor](01-domain/entities/meter.md) (`MEDIDOR`)
  - [Orden de Corte](01-domain/entities/cut-order.md) (`ORDEN_CORTE`)
  - [Ejecución Material de Corte](01-domain/entities/cut-execution.md) (`EJECUCION_CORTE`)
  - [Factura y Deuda](01-domain/entities/debt-invoice.md) (`FACTURA_DEUDA`)
  - [Ubicación Técnica](01-domain/entities/technical-location.md) (`UBICACION_TECNICA`)
  - [Usuario del Sistema](01-domain/entities/system-user.md) (`USUARIO_SISTEMA`)
  - [Rehabilitación / Reconexión](01-domain/entities/reconnection.md) (`REHABILITACION_RECONEXION`)
  - [Suspensión Administrativa](01-domain/entities/suspension-audit.md) (`SUSPENSION_REGISTRO`)
  - [Adjunto / Evidencia](01-domain/entities/cut-attachment.md) (`ADJUNTO_CORTE`)
  - [Infraestructura de Red GIS](01-domain/entities/gis-infrastructure.md) (`INFRAESTRUCTURA_RED_GIS`)
- [Matriz de Relaciones](01-domain/relationships.md): Cardinalidades y justificaciones de enlaces.

### 3. Módulos Operativos
- [M1: Gestión de Cortes y Reposiciones](02-modules/cortes/overview.md) (`cortes.sepsa.net.bo`)
- [M2: Cobros y Kardex Comercial](02-modules/cobros/overview.md) (`cobros.sepsa.web.bo`)
- [M3: Operaciones Terreno NEXO](02-modules/nexo/overview.md) (`nexo.sepsa.bo`)
- [M4: GIS Móvil / Cartografía de Red](02-modules/gis/overview.md) (`QField / QGIS`)

### 4. Funcionalidades (Features)
- [F-001: Filtrado de Morosidad](03-features/feature-001-filter-delinquent-customers.md)
- [F-002: Emisión Masiva de Lotes de Corte](03-features/feature-002-create-cut-orders-batch.md)
- [F-003: Monitoreo de Bandeja de Cortes](03-features/feature-003-cut-orders-tray-management.md)
- [F-004: Registro de Corte en Terreno](03-features/feature-004-execute-field-cut.md)
- [F-005: Anulación Concurrente por Pago](03-features/feature-005-concurrent-payment-cancellation.md)
- [F-006: Gestión de Reconexión](03-features/feature-006-reconnection-management.md)
- [F-007: Kardex y Alerta Fiscal](03-features/feature-007-kardex-inquiry-tax-validation.md)
- [F-008: Cartografía Móvil QField](03-features/feature-008-gis-mobile-field-mapping.md)

### 5. Flujos Transaccionales
- [Flujo 1: Filtrado y Emisión de Lote](04-flows/flow-001-filter-and-issue-cut-batch.md)
- [Flujo 2: Ejecución Material en Terreno](04-flows/flow-002-execute-field-cut.md)
- [Flujo 3: Anulación Automática por Cobranza Concurrente](04-flows/flow-003-concurrent-payment-auto-cancellation.md)
- [Flujo 4: Reconexión y Cierre](04-flows/flow-004-reconnection-workflow.md)

### 6. Reglas de Negocio
- [BR-001: Umbral Mínimo para Emisión de Corte](05-business-rules/BR-001-minimum-threshold.md)
- [BR-002: Exclusión de Intereses en Listados](05-business-rules/BR-002-interest-exclusion.md)
- [BR-003: Anulación Automática por Pago](05-business-rules/BR-003-concurrent-payment-cancellation.md)
- [BR-004: Obligatoriedad de Coordenadas GPS](05-business-rules/BR-004-gps-mandatory-with-bypass.md)
- [BR-005: Excepción Controlada de Fotografías](05-business-rules/BR-005-photo-evidence-with-bypass.md)
- [BR-006: Regularización Obligatoria de Datos Fiscales (CI/NIT)](05-business-rules/BR-006-tax-id-mandatory-regularization.md)
- [BR-007: Prioridad de Reconversión / Otros Ingresos](05-business-rules/BR-007-reconversion-priority.md)
- [BR-008: Impedimento de Suspensión por Reclamos o Convenios](05-business-rules/BR-008-legal-protection-block.md)

### 7. Modelo de Datos y Esquemas
- [Resumen del Modelo de Datos](06-data-model/data-model-overview.md)
- [Diccionario de Campos C-01 a C-51](06-data-model/fields-catalog.md)
- [Diagrama Entidad-Relación (Mermaid)](06-data-model/er-diagram.md)
- [Ciclos de Vida y Estados](06-data-model/states.md)

### 8. Interfaces de Usuario (UI/UX)
- [Mapa de Navegación Global](07-ui/navigation.md)
- [Catálogo de Pantallas P-01 a P-09](07-ui/screens/)
- [Componentes y Acciones](07-ui/components.md)

### 9. Validación, Trazabilidad e Incertidumbres
- [Matriz de Trazabilidad Completa](09-validation/traceability.md)
- [Mapa de Evidencia Temporal](09-validation/evidence-map.md)
- [Incertidumbres y Elementos Desconocidos](09-validation/uncertainties.md)
- [Análisis de Riesgos de Replicación](09-validation/risk-analysis.md)
- [Matriz de Cobertura](09-validation/coverage-matrix.md)

### 10. Guía de Desarrollo para Agentes y Humanos
- [Decisiones de Arquitectura](10-development/architecture-decisions.md)
- [Flujo de Trabajo SDD](10-development/sdd-workflow.md)
- [Flujo de Trabajo TDD](10-development/tdd-workflow.md)

---

## Estado del Conocimiento y Grados de Certeza

Todo el contenido se clasifica formalmente según evidencia empírica:
- `[CONFIRMADO VISUALMENTE]` (60%): Elemento explícito, legible e interactuado en video.
- `[ALTAMENTE INFERIDO]` (25%): Deducción concluyente por comportamiento de interfaz y mensajes del sistema.
- `[INFERIDO]` (10%): Deducción arquitectónica estándar en distribución eléctrica.
- `[HIPÓTESIS]` / `[DESCONOCIDO]` (5%): Elemento pendiente de validación con SEPSA.

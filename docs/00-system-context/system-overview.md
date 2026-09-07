---
title: "Visión General del Sistema SEPSA"
type: "system-context"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "system-purpose.md"
  - "actors.md"
  - "../02-modules/README.md"
  - "../10-development/architecture-decisions.md"
---

# Visión General del Sistema

## Propósito

El **Ecosistema Integrado de Cortes, Reconexiones y Gestión Comercial SEPSA** conforma la suite tecnológica operativa y comercial utilizada por la empresa distribuidora de energía eléctrica **Servicios Eléctricos Potosí S.A. (SEPSA, Bolivia)** para gobernar el ciclo integral de suspensión del servicio por mora, su fiscalización en terreno, la georreferenciación de suministros y activos de red, y la reposición del servicio tras el pago de deudas.

## Problema Medular que Resuelve

El sistema coordina administrativamente la cartera vencida con el despliegue técnico de cuadrillas en campo:
1. **Identificación de Mora Crítica**: Detecta suministros que acumulan dos o más facturas impagas con más de 30 días de antigüedad.
2. **Emisión Masiva Ordenada**: Emite lotes de órdenes de corte físico ordenados por jerarquía territorial (Área, Localidad, Ruta, Circuito y Orden de recorrido).
3. **Ejecución Móvil en Terreno**: Permite a las cuadrillas registrar la desconexión física capturando lectura del medidor, método de corte, coordenadas GPS y fotografías de respaldo.
4. **Protección Concurrente**: Audita pagos en tiempo real para **anular automáticamente** órdenes de corte emitidas si el usuario paga en ventanilla comercial o bancaria antes de la intervención física.
5. **Gestión de Reposición**: Administra el restablecimiento del servicio una vez liquidadas las deudas y aranceles de reconexión.

## Cifras Clave del Ecosistema

- **4 Módulos Macro**: Cortes (`cortes.sepsa.net.bo`), Cobros (`cobros.sepsa.web.bo`), Terreno (`nexo.sepsa.bo`) y GIS Móvil (`QField / QGIS`).
- **9 Pantallas Primarias**: Cubren desde dashboards y bandejas de trabajo hasta fichas 360° y cartografía móvil.
- **12 Capas Vectoriales GIS**: Modelan postes, transformadores, líneas de Media/Baja Tensión y medidores clasificados por mora.
- **65+ Campos Atómicos Identificados**: Catálogo C-01 a C-51 consolidado con tipos y restricciones.
- **14 Entidades de Dominio**: Cubren clientes, contratos, órdenes, facturas, infraestructura y auditoría.
- **8 Reglas de Negocio Críticas**: BR-001 a BR-008 que rigen la operación.

## Nivel de Certeza y Dictamen

- **Certeza Consolidada**: 85% (60% Confirmado Visualmente, 25% Altamente Inferido, 10% Hipótesis, 5% Desconocido).
- **Dictamen**: Sistema mayormente listo para diseño técnico y desarrollo de la versión modernizada.

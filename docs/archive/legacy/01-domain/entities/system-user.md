---
title: "Entidad: Usuario del Sistema"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "cut-order.md"
  - "../../00-system-context/actors.md"
---

# Usuario del Sistema (`USUARIO_SISTEMA`)

## Propósito

Modela la identidad, perfil y datos de contacto del personal operativo autenticado que interactúa con los distintos subsistemas de SEPSA.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `usuario_id` | Integer [PK] | Identificador interno del operador | Ej. 680 | [CONFIRMADO VISUALMENTE] |
| `ci` | Varchar(20) | Cédula de Identidad del funcionario | Ej. '10577452' | [CONFIRMADO VISUALMENTE] |
| `nombre_completo` | Varchar(150) | Nombre y apellidos del usuario | Ej. 'JOSUE DANIEL QUINTANILLA TABOADA' | [CONFIRMADO VISUALMENTE] |
| `email` | Varchar(100) | Correo corporativo SEPSA | Ej. 'josue.quintanilla@sepsa.com.bo' | [CONFIRMADO VISUALMENTE] |
| `telefono` | Varchar(30) | Teléfono de contacto directo | Actualizable desde el Dashboard | [CONFIRMADO VISUALMENTE] |

## Relaciones

- Se le asignan múltiples órdenes en `ORDEN_CORTE` (1:N).
- Registrado como autor de ejecuciones y auditorías.

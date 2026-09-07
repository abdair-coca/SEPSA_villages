---
title: "Entidad: Cliente Titular"
type: "entity"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "account.md"
  - "../../05-business-rules/BR-006-tax-id-mandatory-regularization.md"
---

# Cliente Titular (`CLIENTE`)

## Propósito

Identifica a la persona natural o jurídica titular legal de los derechos y obligaciones del suministro eléctrico ante SEPSA.

## Descripción

Contiene los datos fiscales, nombres o razón social y teléfonos de contacto del usuario. En sistemas legacy, muchas cuentas carecen de CI/NIT, lo que activa advertencias urgentes al consultar el Kardex.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones / Formato | Confianza |
| --- | --- | --- | --- | --- |
| `ci_nit` | Varchar(20) [PK provisional] | Cédula de Identidad o NIT del titular | Opcional en legacy, obligatorio en altas | [CONFIRMADO VISUALMENTE] |
| `nombres` | Varchar(150) | Nombre completo o razón social | Ej. 'MUÑOZ PEDRO' | [CONFIRMADO VISUALMENTE] |
| `telefono_contacto` | Varchar(30) | Teléfono fijo o móvil de contacto | Editable en modal de corte y ficha | [CONFIRMADO VISUALMENTE] |

## Relaciones

- Posee una o más cuentas en `CUENTA_SUMINISTRO` (1:N) [ALTAMENTE INFERIDO].

## Reglas Relacionadas

- [BR-006: Regularización Obligatoria de Datos Fiscales](../../05-business-rules/BR-006-tax-id-mandatory-regularization.md)

## Flujos y Pantallas Relacionadas

- Pantallas: [P-02 Búsqueda](../../07-ui/screens/P-02-delinquency-search.md), [P-04 Ficha](../../07-ui/screens/P-04-cut-file.md), [P-06 Kardex](../../07-ui/screens/P-06-customer-kardex.md).

## Evidencia

- Minuto 03:15 a 03:30 (alerta modal bloqueante "El usuario no tiene Nit o CI... URGENTE").

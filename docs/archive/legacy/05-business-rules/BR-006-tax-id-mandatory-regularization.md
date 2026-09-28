---
id: "BR-006"
title: "Regularización Obligatoria de Datos Fiscales (CI/NIT)"
type: "business-rule"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "../../01-domain/entities/customer.md"
  - "../../07-ui/screens/P-06-customer-kardex.md"
---

# BR-006: Regularización Obligatoria de Datos Fiscales (CI/NIT)

## Regla

Al consultar una cuenta en el módulo de cobranzas (`cobros.sepsa.web.bo`), si el cliente titular carece de Cédula de Identidad o NIT registrado, el sistema debe desplegar una **alerta modal bloqueante urgente** instruyendo al cajero a requerir la actualización tributaria del cliente antes de continuar.

## Entidades Afectadas

- `CLIENTE` (`ci_nit`)
- `CUENTA_SUMINISTRO`

## Evidencia Visual

Modal en pantalla P-06 (minuto 03:16): *"El usuario no tiene Nit o CI. Infórmele que debe realizar la actualización de su información... URGENTE"*.

## Casos de Prueba (TDD)

- `TC-BR-006-01`: Desplegar modal urgente al abrir Kardex de cuenta con `ci_nit IS NULL` o vacío.
- `TC-BR-006-02`: No mostrar modal si `ci_nit` posee un valor válido.

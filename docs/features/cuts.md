# Corte y captura de campo

## Objetivo

Registrar una visita o un corte físico sobre una orden asignada, con contexto suficiente, autorización segura y resultado durable.

## Flujo

1. Técnico abre solo una orden de su paquete.
2. Consulta cliente, dirección, suministro, medidor, deuda, Kardex y actualización.
3. Puede registrar visita y captura local sin afirmar corte.
4. Para cortar, captura lectura, tipo de corte, GPS y evidencia o excepciones.
5. Solicita autorización online inmediatamente antes del corte.
6. Persiste la intención/resultado localmente y encola la operación.
7. Sincroniza primero los bytes de evidencia y luego envía el corte; backend acepta el corte solo si evidencia quedó verificada y ligada a esa operación.
8. Deja el resultado para revisión si la respuesta es incierta.

## Reglas

- La orden debe estar asignada, en `GENERADO` y sin reclamación física.
- Lectura final del medidor: obligatoria, numérica, no negativa, en kWh y asociada al medidor correcto.
- GPS: coordenadas válidas o `saltar_control_coordenadas` con justificación.
- Evidencia: JPEG/PNG optimizada o `saltar_control_fotos` con justificación.
- En el piloto, `POST /v1/evidence/assets` recomputa SHA-256 y guarda asset ligado a orden, operación, técnico y dispositivo. Reintento del mismo identificador/hash/binding es idempotente; cambiar contenido o binding produce conflicto.
- Un corte con foto no se acepta hasta verificar todas sus referencias dentro de la transacción que consume autorización. La excepción existente sin foto conserva motivo y auditoría.
- Sin autorización concluyente y vigente no se corta.
- El éxito visual aparece solo después de verificar persistencia local.

## Estados especiales

`CLAIMED` representa una intención física durable; `CONFIRMED`, un resultado confirmado; `PHYSICAL_UNKNOWN`, un resultado que debe verificarse sin repetir automáticamente la acción física.

## Reposición y ciclo SC08

El técnico solo puede reponer sobre la orden de su corte confirmado. En Fase 2, la operación `RECONNECTION` se guarda en el `OperationRecord` existente con `effectiveAt`, `technicianNameSnapshot` y `demora`; después cambia la orden a `RECONEXIÓN`. El backend piloto conectado ahora admite la habilitación provisional y el sync de esta acción, con auditoría e idempotencia; no es una integración oficial de SEPSA.

### Persistencia y captura

- Cada acción física conserva su `operationId` existente para reintentos; `orderId` agrupa el corte y su reposición. Se reutilizan los almacenes existentes, sin `cycleId` ni tabla de eventos adicional. El modelo está acordado en [Decisiones vigentes](../DECISIONS.md#d010--ciclo-de-corte-y-reposicion-sin-identidad-duplicada).
- Al confirmar la reposición, `effectiveAt` conserva el instante capturado; `FECHA_REPO` y `HORA_REPO` se presentarán en `America/La_Paz` en la proyección SC08. `technicianId` queda junto al snapshot del nombre histórico. `DEMORA` conserva la observación del técnico o `Sin demora`.
- El registro CUT conserva el snapshot histórico de nombre requerido para `TEC_CORTE`. El estado de sync puede cambiar, pero los datos físicos y la identidad del técnico no se reemplazan en reintentos.
- La habilitación piloto es online, de un solo uso y vinculada a orden, técnico, dispositivo, operación y versión. Sus rutas están marcadas como `PILOT_PROVISIONAL`; no consultan ni infieren pagos.

Un ACK remoto se confirma solo con recibo completo. Si se pierde la respuesta, se consulta estado con la misma operación; conflicto o resultado desconocido queda para revisión y no crea otro ciclo. Los significados SC08 y sus pendientes se mantienen en [Modelo de dominio](../DOMAIN.md).

## Componentes involucrados

Dominio/policies, `app/store`, repositorio IndexedDB, adaptador de autorización, `FieldApp`, backend provisional y cola de sincronización.

## Pendientes

Retención y contrato oficial de fotos, límites de tamaño/MIME y política definitiva de excepciones: `TODO: VALIDAR CON SEPSA`. Contrato actual `PILOT_PROVISIONAL`.

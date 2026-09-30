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
7. Sincroniza o deja el resultado para revisión si la respuesta es incierta.

## Reglas

- La orden debe estar asignada, en `GENERADO` y sin reclamación física.
- Lectura final del medidor: obligatoria, numérica, no negativa, en kWh y asociada al medidor correcto.
- GPS: coordenadas válidas o `saltar_control_coordenadas` con justificación.
- Evidencia: JPEG/PNG optimizada o `saltar_control_fotos` con justificación.
- Sin autorización concluyente y vigente no se corta.
- Reserva y consumo de autorización consultan `PaymentAuthority` bajo transacción local; solo `CLEAR` permite avanzar. El runtime sin fuente/adaptador de pagos devuelve `UNKNOWN` y bloquea CUT. Un pago confirmado previo prevalece; sync permanece en conflicto y la autorización no se consume. Ver [pagos y concurrencia](payments.md).
- El éxito visual aparece solo después de verificar persistencia local.

## Estados especiales

`CLAIMED` representa una intención física durable; `CONFIRMED`, un resultado confirmado; `PHYSICAL_UNKNOWN`, un resultado que debe verificarse sin repetir automáticamente la acción física.

## Componentes involucrados

Dominio/policies, `app/store`, repositorio IndexedDB, adaptador de autorización, `FieldApp`, backend provisional y cola de sincronización.

## Pendientes

Umbral de precisión GPS, retención de coordenadas, catálogo definitivo, lectura excepcional y contrato oficial de fotos: `TODO: VALIDAR CON SEPSA`.

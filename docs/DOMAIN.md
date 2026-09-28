# Modelo de dominio operativo

Este documento define significados y relaciones que no deben reinterpretarse desde la UI. Los nombres exactos de columnas de SEPSA siguen sujetos a validación.

## Entidades

| Concepto | Significado operativo |
|---|---|
| **Cliente** | Titular visible del suministro. Puede tener uno o más suministros; relación definitiva pendiente de SEPSA. |
| **Cuenta/suministro** | Punto contractual y operativo sobre el que se consulta deuda y se emite una orden. |
| **Domicilio/ubicación** | Dirección, referencias y clasificación territorial usada para localizar y filtrar. |
| **Medidor** | Equipo asociado al suministro. La lectura final debe identificarlo y expresarse en kWh. |
| **Deuda/Kardex** | Contexto financiero e histórico que explica la elegibilidad; sus campos de origen no son contratos oficiales. |
| **Orden de corte** | Trabajo administrativo dirigido a un suministro. Conserva creador, técnico, versión, propósito, estado y contexto. |
| **Paquete de trabajo** | Versión descargada de las órdenes asignadas a un técnico y dispositivo. |
| **Visita** | Registro local de presencia/captura sin afirmar que hubo corte físico. |
| **Ejecución** | Operación de corte o reconexión con actor, dispositivo, captura, evidencia, autorización y estado físico. |
| **Evidencia** | Referencia a imagen vinculada a orden, operación, técnico y dispositivo; puede existir excepción auditable. |
| **Operación de sync** | Identidad durable de una acción local y su estado de envío, error, intentos y conflicto. |
| **Pago** | Evento financiero externo. El técnico no lo registra dentro del flujo de corte; un pago concurrente puede anular/bloquear la orden. |

## Relaciones principales

```text
Cliente → cuenta/suministro → medidor
                    ├→ ubicación y contexto de deuda
                    └→ orden de corte → paquete del técnico
                                      ├→ visita/captura
                                      ├→ autorización
                                      ├→ ejecución/evidencia
                                      └→ auditoría/sincronización
```

La aplicación trabaja con `OperationalContext` para transportar el contexto completo de una deuda a una orden. No convertir una relación observada en el Excel o en una pantalla en una cardinalidad definitiva sin confirmación.

## Estados actuales

### Orden

`GENERADO` → `EJECUTADO` → `RECONEXIÓN` o `ANULADO` según la transición permitida. Una orden generada puede anularse por pago o condición administrativa; una operación física incierta no se presenta como ejecutada.

### Estado físico

- `NONE`: sin reclamación física.
- `CLAIMED`: intención física durable/reclamada.
- `CONFIRMED`: resultado físico confirmado.
- `PHYSICAL_UNKNOWN`: resultado incierto; requiere verificación humana y no reintento físico automático.

### Sincronización

`pending` → `syncing` → `synced` o `failed`. Un conflicto o resultado incierto puede quedar protegido para revisión y no debe desaparecer de la cola.

## Captura de campo

Una captura de corte contiene lectura final, medidor, tipo de corte, ubicación/GPS, precisión, disponibilidad y evidencia o excepción. La lectura final es obligatoria para confirmar el corte. GPS y fotos admiten únicamente sus excepciones controladas con motivo auditable. Umbrales y semántica definitiva: `TODO: VALIDAR CON SEPSA`.

## Datos financieros y fuente

Los importes se manejan en centavos enteros en el piloto. El Excel y los mocks son fuentes provisionales de carga o demostración. No inventar significado para campos desconocidos, fechas obsoletas, coordenadas ausentes, estados o códigos.

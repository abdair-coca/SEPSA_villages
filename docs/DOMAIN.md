# Modelo de dominio operativo

Este documento define significados y relaciones que no deben reinterpretarse desde la UI. Los nombres y descripciones de la tabla oficial SC08 recibida son la referencia; las equivalencias con el modelo operativo y los puntos no confirmados quedan `TODO: VALIDAR CON SEPSA`.

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

`GENERADO` → `EJECUTADO` → `RECONEXIÓN` o `ANULADO` según la transición permitida. Una orden generada puede anularse por condición administrativa; una operación física incierta no se presenta como ejecutada.

### Estado físico

- `NONE`: sin reclamación física.
- `CLAIMED`: intención física durable/reclamada.
- `CONFIRMED`: resultado físico confirmado.
- `PHYSICAL_UNKNOWN`: resultado incierto; requiere verificación humana y no reintento físico automático.

### Sincronización

`pending` → `syncing` → `synced` o `failed`. Un conflicto o resultado incierto puede quedar protegido para revisión y no debe desaparecer de la cola.

## Captura de campo

Una captura de corte contiene lectura final, medidor, tipo de corte, ubicación/GPS, precisión, disponibilidad y evidencia o excepción. La lectura final es obligatoria para confirmar el corte y no admite excepción. GPS y fotos admiten únicamente sus excepciones controladas con motivo auditable. Umbrales de validación: `TODO: VALIDAR CON SEPSA`.

## Registro oficial SC08 de cortes y reposiciones

La tabla oficial SC08 representa cada ciclo histórico en una fila: un corte y su reposición correspondiente cuando exista. Una misma cuenta puede aparecer en varias filas por ciclos distintos. Los campos marcados con `*` son obligatorios.

### Correspondencias actuales de los campos 2–7

Estas asociaciones describen el importador provisional, PostgreSQL piloto y las etiquetas/presentación existentes. No certifican equivalencias oficiales con SEPSA ni cambian los significados que ya usa la aplicación.

| Campo SC08 | Fuente y persistencia observadas | Presentación actual |
|---|---|---|
| `NRO_CUENTA` | `CODIGO` del Excel se importa como `debtors.account_id`. | Cuenta / `accountId`. |
| `NOMBRE` | `NOMBRE` se importa como `debtors.customer_name`. | Cliente / `customerName`. |
| `DIRECCION` | `DIRECCION` se importa como `debtors.address`; referencias se mantienen aparte en `reference_text`. | Dirección; las referencias complementarias no sustituyen la dirección. |
| `MEDIDOR` | `MEDIDOR` se normaliza en `meter_id` y, si viene indicada, `meter_brand`. | Medidor y marca se presentan con los controles existentes. |
| `AREA` | `AREA COD` se guarda en `debtors.area`; el nombre `AREA` se conserva como `context.area_name`. | La administración presenta Área / localidad y mantiene filtros de Área y Localidad. Confirmar si la salida SC08 espera código, nombre o ambos. |
| `LOCALIDAD` | `LOC COD` y `LOCALIDAD` se importan juntos en `debtors.locality` (por ejemplo, `078 - COA COA`). | Localidad con el código y nombre actuales; confirmar el formato de salida. |

La fuente observada de estos valores es la carga Excel y el backend piloto, ambos provisionales. Mantener las normalizaciones y presentaciones existentes; confirmar con SEPSA cualquier equivalencia o formato de salida SC08 antes de tratarlos como datos oficiales.

Trazabilidad de esta revisión: esquema en `backend/sql/001_init.sql`, mapeo de importación en `backend/sql/seeds/005_definitive_seed.sql`, proyección del backend en `backend/src/mappers/` (`order.mapper.ts`, `debtor.mapper.ts`), adaptación al contexto de campo en `field-app/src/adapters/http/client.ts` y etiquetas en `field-app/src/screens/OperationsApp.tsx` / `FieldApp.tsx`.

- `NRO_CORREL`: lo asigna SEPSA. La aplicación lo recibe tal cual, como el código de domicilio. Todavía no existe en el modelo.
- `NIV_CALIDAD`: lo asigna SEPSA. La aplicación lo recibe; no lo calcula.
- `FECHA_REPO` y `HORA_REPO`: fuera de alcance del proyecto. Su fuente y su validez son responsabilidad de SEPSA.
- `TIEMPO`: fuera de alcance del proyecto. Depende de la fecha de pago, que también queda fuera.
- `DEMORA`: fuera de alcance del proyecto. No se toma en cuenta en este proyecto ni en su documentación.
- `TEC_CORTE`: técnico que realizó físicamente el corte; se conserva su nombre tal como era en la fecha del evento.
- `TEC_REPOS`: técnico que realizó físicamente la reposición; puede ser distinto del técnico de corte y también se conserva su nombre histórico.
- `CATEGORÍA`: se asocia con `tariff`, confirmado el 2026-10-13.
- `ENER_PROM`, `POT_FACT` e `IMP_REDUC`: fuera de alcance del proyecto. Su fuente y su validez son responsabilidad de SEPSA.

`FECHA_PAGO` y `HORA_PAGO` quedan fuera del alcance del proyecto: el procesamiento de pagos no forma parte del piloto.

El formato de salida es la tabla SC08 oficial de 21 campos. El destino (archivo o API) no está definido: `TODO: VALIDAR CON SEPSA`. No asumir un endpoint oficial.

## Datos financieros y fuente

Los importes se manejan en centavos enteros en el piloto. El Excel y los mocks son fuentes provisionales de carga o demostración. No inventar significado para campos desconocidos, fechas obsoletas, coordenadas ausentes, estados o códigos.

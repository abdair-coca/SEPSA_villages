# 14. Pendientes y decisiones

Fuente: preguntas para SEPSA y respuestas del equipo del 2026-10-13, y los documentos 01 a 13.
Fecha: 2026-10-13
Estado: entrega, copia fechada. La sección A ya está respondida y confirmada. La B corresponde a SEPSA. La C se revisó contra el código el 2026-10-13; cada fila indica su estado.

## A. Respondido el 2026-10-13

| Tema | Respuesta aplicada |
|---|---|
| Elegibilidad para cortar (mora, intereses, CI/NIT, reclamos, cargos y prioridad) | La decide el administrador al seleccionar los suministros. El sistema no la valida |
| Captura del corte | Lectura final, GPS y foto. Si falta GPS o foto, excepción con motivo escrito (ya implementada) |
| Consulta no concluyente | El técnico la reintenta con el mismo identificador. No hay corte mientras no sea concluyente |
| Conciliación | Sin política adicional. El administrador ve las operaciones por conciliar en solo lectura |
| NIV_CALIDAD y NRO_CORREL | Los asigna SEPSA. La app los recibe tal cual |
| FECHA_PAGO, HORA_PAGO y los campos FECHA_REPO, HORA_REPO, TIEMPO, DEMORA, ENER_PROM, POT_FACT e IMP_REDUC | Fuera de alcance. Si presentan problemas, se resuelven en el sistema de SEPSA |
| Formato del SC08 | La tabla de 21 campos recibida el 2026-10-03 |
| Fotos de evidencia | En PostgreSQL, permanentes, sin excepciones |
| Umbrales, privacidad y retención de lecturas | Fuera de alcance del proyecto |
| Borrado local al cerrar sesión | Se mantiene: no se borran |
| Mapa de teselas (servicio externo) | Declarado en la entrega; no se pregunta al proveedor |
| Lectura final del medidor | Sin excepción: se mantiene como está en el sistema |
| CATEGORÍA del SC08 | Se asocia con `tariff`. Confirmado |

## B. Decisiones de SEPSA

El proyecto entrega la información. SEPSA define estas decisiones.

| Tema | Estado actual en el piloto |
|---|---|
| Proveedor de nube, topología, TLS y rotación de secretos | No definido en el repo |
| Límite de intentos de acceso compartido entre réplicas | En la memoria de un proceso |
| Límite de intentos tras un proxy y caducidad de la sesión por inactividad | Cuenta por la dirección del socket; la sesión dura 7 días sin caducidad por inactividad |
| Sesiones por dispositivo, identidad del dispositivo y revocación | La sesión no se liga a un dispositivo |
| Proveedor de métricas, alertas y umbrales | No definido |
| Copias de seguridad cifradas, RPO, RTO y prueba de restauración | No implementadas; el repo solo describe el procedimiento |
| Registro de cambios operativos | No definido en el repo |
| Responsable, custodia y retención de datos personales (clientes, técnicos, sesiones y auditoría) | Sin definir. El sistema no borra datos |
| Datos de personas en el historial de git | Los seeds `005` y `006` se retiraron del árbol de trabajo (D031); el historial los conserva y no se reescribe. Decidir si SEPSA exige purgarlo |
| API oficial y su integración | Hay un adaptador provisional |
| Destino del SC08: archivo o API | El sistema no genera hoy un archivo SC08. `TODO: VALIDAR CON SEPSA` |
| Relación cliente, cuenta y suministro | Supuesto del piloto: una cuenta y un suministro por fila. `TODO: VALIDAR CON SEPSA` |

## C. Pendientes de código

Estado al 2026-10-13, comprobado contra el código.

| Tema | Estado y qué falta |
|---|---|
| Datos del técnico desde otro dispositivo (RF-36, D029) | Cerrado el 2026-10-14. El técnico consulta su registro y sus fotos desde el servidor (`backend/test/technician-record.integration.test.ts`, `backend/test/evidence-read.integration.test.ts`). En navegador, con un dispositivo nuevo, se comprobaron el registro y la foto. Un consumo con otro dispositivo se rechaza (`backend/test/reconnection.test.ts`). Verificado a mano en dos dispositivos físicos y en vista móvil (`11-resultados-pruebas.md`, apartado 8). |
| Filas de personas en los seeds `005` y `006` (D031) | Hecho en el árbol de trabajo. El historial de git no se reescribe; decidir si SEPSA exige purgarlo (sección B). |
| NRO_CORREL y NIV_CALIDAD (D027) | Sin cambio. No están en el modelo; se añaden cuando SEPSA defina cómo los envía. |
| FECHA_CORTE y HORA_CORTE | Verificado: el momento llega al servidor como `recorded_at` dentro del payload de la operación (`sync_operations.payload`). No hay exportación SC08 que lo use (`TODO: VALIDAR CON SEPSA`). |
| Revisión humana desde la pantalla (RF-23, D024) | Parcial. La vista de conciliación es de solo lectura. La revisión sigue solo en la API `POST /v1/sync/operations/:id/review`. |
| Reconsulta al volver la red (D028) | Decisión abierta. Al volver la red, la app consulta el estado de la autorización o la habilitación y, si está reservada, la consume con el mismo `operationId` (D019). D028 dice que el técnico reintenta la consulta. Hay que decidir si la recuperación automática se mantiene (y se ajusta D028) o si el código pasa a ser manual. |

Queda una decisión abierta para el equipo: la reconsulta automática.

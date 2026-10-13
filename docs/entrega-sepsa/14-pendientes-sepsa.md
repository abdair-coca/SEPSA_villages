# 14. Pendientes y decisiones

Fuente: preguntas para SEPSA y respuestas del equipo del 2026-10-13, y los documentos 01 a 13.
Fecha: 2026-10-13
Estado: entrega, copia fechada. La sección A ya está respondida y confirmada. La B corresponde a SEPSA. La C requiere cambio de código, que no se ha hecho.

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

Estas acciones se acordaron, pero requieren cambios en el código. No se han hecho.

| Tema | Qué falta |
|---|---|
| Datos del técnico desde otro dispositivo | Verificar que un segundo dispositivo vea los cortes, visitas y fotos sincronizados (RF-36) |
| Filas de personas en los seeds `005` y `006` | Eliminarlas del repo. `005` lo usa el bootstrap, así que hay que cambiarlo también. Reescribir el historial de git es una decisión aparte |
| NRO_CORREL y NIV_CALIDAD | No existen en el modelo. Se añaden cuando SEPSA defina cómo los envía |
| FECHA_CORTE y HORA_CORTE | Verificar que el momento del corte llega al servidor |
| Revisión humana desde la pantalla | Hoy solo existe como API (RF-23) |

No quedan preguntas abiertas para el equipo.

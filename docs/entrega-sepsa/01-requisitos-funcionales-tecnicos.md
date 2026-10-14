# 01. Requisitos funcionales y técnicos

Fuente: código de `backend/` y `field-app/`; respuestas del equipo del 2026-10-13.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Detalle completo en el anexo A01.

**Implementado** significa que existe en el código y tiene pruebas; no que esté validado en campo ni aprobado por SEPSA.

## Estado

- **Requisitos funcionales (36):** 32 implementados; 2 parciales (RF-23, revisión humana solo como API; RF-36, consulta desde otro dispositivo sin prueba con dos dispositivos físicos); 1 pendiente (RF-07, anulación de órdenes, que el piloto no tiene); 1 fuera del sistema (RF-29, elegibilidad, cargos y prioridad de reconexión, que decide el administrador).
- **Requisitos técnicos (17):** 16 implementados; RT-17 pendiente de SEPSA (proveedor de nube, topología, TLS, rotación de secretos, sesiones por dispositivo y copias de seguridad).

## Reglas clave

- **Roles y permisos:** `ADMIN` y `TECHNICIAN`. El técnico opera solo sus órdenes asignadas, y el servidor lo valida.
- **Corte:** exige lectura final del medidor (kWh, no negativa), GPS y foto; son obligatorios. Solo GPS o foto admiten excepción con motivo. La lectura final no admite excepción.
- **Autorización en línea:** de un solo uso, justo antes de cortar. Sin autorización concluyente no hay corte. Un consumo incierto se reintenta con el mismo identificador; nunca se pide una autorización nueva sola.
- **Datos locales:** la intención, la operación y la cola se guardan en el dispositivo antes de mostrar éxito. La cola sobrevive a recargas, cierres y pérdida de red. Si se pierde la respuesta, la operación queda `PHYSICAL_UNKNOWN` y no se reenvía.
- **Reconexión:** solo sobre un corte confirmado, con habilitación de un solo uso. La orden pasa a `RECONEXIÓN`.
- **Seguridad y datos:** cookie `HttpOnly`; límite de 5 intentos por 60 s; contraseñas con scrypt; importes en centavos enteros; los registros no contienen datos personales.

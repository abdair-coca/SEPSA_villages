# 14. Pendientes y decisiones

Fuente: preguntas para SEPSA y respuestas del equipo del 2026-10-13, y los documentos 01 a 13.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Resumen de las tres secciones; el detalle de cada tema, con su respuesta o su estado, está en el anexo A14.

## A. Respondido el 2026-10-13 (13 temas)

- **Elegibilidad** (mora, intereses, CI/NIT, reclamos, cargos y prioridad): la decide el administrador; el sistema no la valida.
- **Captura del corte:** lectura final, GPS y foto; excepción con motivo si falta GPS o foto (implementada). La lectura final no admite excepción.
- **Consulta no concluyente:** reintento con el mismo identificador; no hay corte mientras no sea concluyente.
- **Conciliación:** sin política adicional; solo lectura para el administrador.
- **NIV_CALIDAD y NRO_CORREL:** los asigna SEPSA; la app los recibe tal cual.
- **Campos fuera de alcance:** FECHA_PAGO, HORA_PAGO y los campos de reparación y energía; si presentan problemas, se resuelven en el sistema de SEPSA.
- **Formato del SC08:** la tabla de 21 campos recibida el 2026-10-03.
- **Fotos de evidencia:** en PostgreSQL, permanentes, sin excepciones.
- **Umbrales, privacidad y retención de lecturas:** fuera de alcance del proyecto.
- **Borrado local al cerrar sesión:** se mantiene; no se borran datos.
- **Mapa de teselas:** declarado en la entrega; no se pregunta al proveedor.
- **CATEGORÍA del SC08:** se asocia con `tariff`. Confirmado.

## B. Decisiones de SEPSA (12 temas)

Proveedor de nube, topología, TLS y rotación de secretos; límite de intentos compartido entre réplicas; límite tras un proxy y caducidad de la sesión por inactividad; sesiones por dispositivo y revocación; proveedor de métricas y alertas; copias cifradas, RPO, RTO y prueba de restauración; registro de cambios operativos; responsable, custodia y retención de datos personales; datos de personas en el historial de git; API oficial y su integración; destino del SC08 (archivo o API); y relación cliente, cuenta y suministro.

## C. Pendientes de código (6 temas)

- **Datos del técnico desde otro dispositivo (RF-36, D029):** parcial; falta probar con dos dispositivos reales.
- **Seeds `005` y `006` (D031):** hecho en el árbol de trabajo; el historial no se reescribe.
- **NRO_CORREL y NIV_CALIDAD (D027):** sin cambio; se añaden cuando SEPSA defina el envío.
- **FECHA_CORTE y HORA_CORTE:** el momento llega al servidor como `recorded_at`; no hay exportación SC08 que lo use.
- **Revisión humana desde la pantalla (RF-23, D024):** parcial; la conciliación es de solo lectura y la revisión sigue solo en la API.
- **Reconsulta al volver la red (D028):** decisión abierta para el equipo: mantener la recuperación automática (y ajustar D028) o volverla manual.

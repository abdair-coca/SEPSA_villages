# Propuesta: Piloto operativo multirol para cortes

## Intención

Convertir el producto en un piloto operativo multirol que conecte administración y trabajo técnico. El administrador crea y asigna una orden individual; el técnico la consulta, valida y ejecuta con operación offline-first, autorización online inmediata y trazabilidad completa. El cambio 002 permanece histórico e intacto.

## Alcance

### Incluido

- Roles Administrador y Técnico con control de acceso.
- Dashboard operacional, búsqueda de morosos, creación masiva por lote y asignación individual.
- Consulta técnica de cliente, domicilio, medidor, Kardex, mapa y ubicación.
- Captura de lectura, GPS, evidencia y resultado de visita.
- Autorización online inmediata antes del corte y bloqueo ante incertidumbre.
- Persistencia local, sincronización idempotente y auditoría administrativa.
- Contratos y datos provisionales identificados explícitamente.

### Fuera de alcance

- Asignación masiva; queda como propuesta para el siguiente incremento con distribución explícita y control de carga.
- Nuevas funciones de reconexión; se conserva la implementación histórica.
- Cobranza presencial dentro del flujo técnico de corte.
- Integración, autenticación o contrato definitivo de SEPSA.
- Acceso administrativo a secretos o credenciales técnicas.

## Capacidades

### Nuevas capacidades

- `identidad-control-acceso`: autenticación, roles, permisos y auditoría.
- `gestion-ordenes-corte`: búsqueda con filtros de morosidad, creación individual, creación masiva por lote y asignación.
- `consulta-operativa-tecnico`: contexto completo de la orden y suministro.
- `captura-campo`: GPS, lectura, evidencia y resultado de visita.

### Capacidades modificadas

- `paquete-trabajo-campo`: recibe órdenes creadas y asignadas por administración.
- `ejecucion-corte`: incorpora contexto completo y captura de campo.
- `trazabilidad-operativa`: incorpora acciones administrativas y cadena completa.

## Enfoque

Construir un corte vertical con experiencias separadas por rol y un flujo compartido. Administración puede requerir conexión inicialmente; el técnico conserva consulta, captura y persistencia offline. Se reutilizan autorización, ejecución, persistencia y sincronización del cambio 002. Ningún adapter provisional se presentará como API oficial de SEPSA.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| Experiencia administrativa | Nueva | Dashboard, morosos, órdenes y auditoría |
| PWA técnica | Modificada | Contexto, mapa, GPS, lectura y corte |
| Dominio y persistencia | Modificada | Identidad, asignación, datos y trazabilidad |
| Integraciones | Modificada | Flujo multirol provisional e idempotente |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Pago concurrente o dato obsoleto | Autorización online inmediata y bloqueo seguro |
| Acceso indebido | Permisos por rol y asignación, validados y auditados |
| Duplicados o conflictos offline | Identificadores únicos, versiones e idempotencia |
| Datos personales o GPS inexacto | Mínimo privilegio, precisión registrada y fallback textual |

## Rollback

Retirar el cambio 003 y conservar sin modificación la implementación y documentación histórica del cambio 002.

## Dependencias

- Adapters provisionales de identidad, datos operativos y autorización.
- Validación futura de fuentes, semántica y contratos con SEPSA.

## Criterios de éxito

- [ ] Administrador crea y asigna una orden individual sin duplicarla.
- [x] Administrador filtra morosidad y crea un lote idempotente con vista previa, omisiones y auditoría.
- [ ] Técnico sincroniza únicamente órdenes asignadas y consulta su contexto offline.
- [ ] Corte solo se registra con autorización online válida.
- [ ] Resultado sobrevive reinicio y se sincroniza sin duplicados.
- [ ] Administrador consulta actor, tiempos, evidencia, resultado y sincronización.

## Pendientes de definición

- Continuidad de cobranza presencial y alcance futuro de reconexión.
- Fuente y semántica oficial de Kardex y deuda.
- Precisión GPS, reglas de lectura, autenticación real y contrato SEPSA.

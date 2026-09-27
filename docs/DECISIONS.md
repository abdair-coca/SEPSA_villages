# Decisiones vigentes

Solo contiene decisiones que un agente no debe reinterpretar sin una instrucción explícita del equipo.

## D001 — Código actual y reglas confirmadas son fuentes distintas

**Estado:** vigente
**Decisión:** El código describe la implementación actual; `docs/RULES.md` y este archivo describen restricciones y decisiones vigentes.
**Consecuencia:** Si divergen, identificar si se trata de un defecto, una decisión pendiente o documentación obsoleta antes de cambiar comportamiento.

## D002 — Primera entrega vertical individual

**Estado:** vigente
**Decisión:** Validar primero una orden individual de extremo a extremo. La operación masiva puede existir en el piloto, pero no desplaza esa prioridad.
**Consecuencia:** No ampliar el alcance con lotes, reconexiones nuevas o cobranza mientras el flujo individual no esté verificable.

## D003 — Persistencia local antes de confirmar

**Estado:** vigente
**Decisión:** El técnico trabaja offline con IndexedDB; una operación se confirma al usuario solo después de quedar guardada localmente y en la cola cuando corresponda.
**Consecuencia:** La red puede retrasar sincronización, pero no puede borrar una operación aceptada.

## D004 — Corte físico con autorización online

**Estado:** vigente
**Decisión:** Solo una autorización concluyente, vigente, ligada a orden/técnico/dispositivo/operación/versión y de un solo uso permite el corte.
**Consecuencia:** Offline, timeout, pago concurrente o estado incierto bloquean; un resultado físico incierto requiere conciliación humana.

## D005 — Permiso por identidad asignada

**Estado:** vigente
**Decisión:** El backend limita al técnico a sus órdenes asignadas y vuelve a validar acciones administrativas.
**Consecuencia:** La UI puede orientar, pero nunca sustituye autorización del backend.

## D006 — Adaptadores provisionales

**Estado:** vigente
**Decisión:** Dominio y casos de uso dependen de puertos/adaptadores; local, simulado y HTTP pueden cambiar sin acoplar el dominio a una API futura.
**Consecuencia:** Endpoints y payloads del piloto no se documentan como contrato oficial.

## D007 — Historial e idempotencia

**Estado:** vigente
**Decisión:** Operaciones físicas, administrativas y financieras usan identificadores únicos, versionado e idempotencia.
**Consecuencia:** Asignaciones, pagos, anulaciones, conflictos y auditoría conservan historia; no se resuelven con última escritura gana.

## D008 — Datos de campo y evidencia

**Estado:** vigente con pendientes
**Decisión:** La lectura final es obligatoria para confirmar un corte; GPS y foto requieren captura o excepción justificada. La evidencia se conserva localmente y el sync actual envía referencias/metadatos.
**Consecuencia:** El contrato oficial de subida, verificación, retención y umbrales debe validarse con SEPSA antes de fijarlo.

## D009 — Fuente de datos provisional

**Estado:** vigente
**Decisión:** Excel, semillas y mocks sirven para carga o demostración, no son el modelo definitivo ni autorizan inferir semántica.
**Consecuencia:** Campos, estados, relaciones y fechas no confirmados se mantienen explícitamente pendientes.

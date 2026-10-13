# Decisiones vigentes

Solo contiene decisiones que un agente no debe reinterpretar sin una instrucción explícita del equipo.

## D001 — Código actual y reglas confirmadas son fuentes distintas

**Estado:** vigente
**Decisión:** El código describe la implementación actual; `docs/RULES.md` y este archivo describen restricciones y decisiones vigentes.
**Consecuencia:** Si divergen, identificar si se trata de un defecto, una decisión pendiente o documentación obsoleta antes de cambiar comportamiento.

## D002 — Primera entrega vertical individual

**Estado:** vigente
**Decisión:** Validar primero una orden individual de extremo a extremo. La operación masiva puede existir en el piloto, pero no desplaza esa prioridad.
**Consecuencia:** No ampliar el alcance con lotes o reconexiones nuevas mientras el flujo individual no esté verificable.

## D003 — Persistencia local antes de confirmar

**Estado:** vigente
**Decisión:** El técnico trabaja offline con IndexedDB; una operación se confirma al usuario solo después de quedar guardada localmente y en la cola cuando corresponda.
**Consecuencia:** La red puede retrasar sincronización, pero no puede borrar una operación aceptada.

## D004 — Corte físico con autorización online

**Estado:** vigente
**Decisión:** Solo una autorización concluyente, vigente, ligada a orden/técnico/dispositivo/operación/versión y de un solo uso permite el corte.
**Consecuencia:** Offline, timeout o estado incierto bloquean; un resultado físico incierto requiere conciliación humana.

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
**Decisión:** Operaciones físicas y administrativas usan identificadores únicos, versionado e idempotencia.
**Consecuencia:** Asignaciones, anulaciones, conflictos y auditoría conservan historia; no se resuelven con última escritura gana.

## D008 — Datos de campo y evidencia

**Estado:** vigente con pendientes
**Decisión:** La lectura final es obligatoria para confirmar un corte; GPS y foto requieren captura o excepción justificada. La evidencia se conserva localmente y el sync actual envía referencias/metadatos.
**Consecuencia:** El contrato oficial de subida, verificación, retención y umbrales debe validarse con SEPSA antes de fijarlo.

## D009 — Fuente de datos provisional

**Estado:** vigente
**Decisión:** Excel, semillas y mocks sirven para carga o demostración, no son el modelo definitivo ni autorizan inferir semántica.
**Consecuencia:** Campos, estados, relaciones y fechas no confirmados se mantienen explícitamente pendientes.

## D010 — Ciclo de corte y reposición sin identidad duplicada

**Estado:** vigente
**Decisión:** Una orden identifica un ciclo: un CUT confirmado y su RECONNECTION cuando ocurra. Se reutiliza el `orderId` existente para agruparlos y el `operationId` existente para la identidad/idempotencia de cada acción. Los hechos SC08 viven en el `OperationRecord` actual; no se agrega `cycleId` ni tabla de eventos.
**Consecuencia:** Los campos físicos (`effectiveAt`, técnico y snapshot del nombre, `demora`) permanecen inmutables mientras avanza el estado de sync. Si el vínculo de una orden no identifica exactamente un CUT confirmado, el backend conserva el conflicto para revisión en vez de inferirlo. La corrección auditable de un dato físico erróneo queda pendiente de definir.

## D011 — Versión local y versión autoritativa del backend

**Estado:** vigente
**Decisión:** `WorkOrder.version` sigue siendo la revisión CAS local usada por IndexedDB; `WorkOrder.authoritativeVersion` conserva la última versión conocida del servidor. Solicitudes de CUT/RECONNECTION usan la versión autoritativa recibida al habilitar; las transiciones locales no la sustituyen.
**Consecuencia:** Un ACK físico válido avanza `authoritativeVersion` una vez (`order_version + 1`) sin repetir la transición ni aumentar de nuevo la revisión local. Así la orden sigue operable antes del siguiente paquete remoto, y los dos contadores no se comparan ni intercambian.

## D012 — Rutas desconocidas sin sesión responden 401

**Estado:** vigente
**Decisión:** La tabla de rutas resuelve primero las rutas públicas y exige sesión antes de buscar en las protegidas. Una ruta desconocida sin sesión responde 401, no 404.
**Consecuencia:** Responder 404 sin sesión, o cambiar ese orden, altera el contrato HTTP; requiere decisión explícita del equipo.

## D013 — Forma de la respuesta de consulta de operación

**Estado:** vigente
**Decisión:** `lookupOperation` (sincronización) decide en el servicio si la respuesta es `confirmed`, `unknown` o `not_found`, porque el contrato HTTP la expone tal cual.
**Consecuencia:** Separar esa forma en un presentador no aporta nada mientras la regla del recibo completo siga en el mismo punto. Un cambio de contrato se hace en el servicio y en `openapi/pilot-provisional.openapi.json` a la vez.

## D014 — Repositorios locales de una clase por puerto

**Estado:** vigente
**Decisión:** `LocalRepository` (`adapters/indexeddb/repository.ts`) y `authority-repository.ts` se mantienen como una clase por puerto: sus métodos comparten transacciones atómicas y helpers privados.
**Consecuencia:** Dividirlos por agregado exige rediseñar esas transacciones antes. No se dividen solo por tamaño.

## D015 — Resultados no concluyentes de autorización se guardan para revisión

**Estado:** vigente
**Decisión:** Al pedir autorización de corte o de reconexión, un 401 y un rechazo definitivo del backend se guardan como negativa. Un 5xx, un replay de operación (`AUTHORIZATION_OPERATION_REPLAY`, `ENABLEMENT_OPERATION_REPLAY`) o un conflicto de identificador (`IDEMPOTENCY_CONFLICT`) se guardan como resultado incierto para revisión, igual que un timeout.
**Consecuencia:** Ninguno de esos casos autoriza el corte ni la reconexión. El registro queda local, con el código del backend y pendiente de sincronizar; la acción física no se repite.

## D016 — Mensajes de error en español; códigos en inglés

**Estado:** vigente
**Decisión:** Los mensajes de error que ve el técnico o el administrador, tanto del backend como de `DomainError`, están en español. Los `code` siguen en inglés: son el contrato.
**Consecuencia:** Las pruebas comparan códigos; un texto puede cambiar sin cambiar el contrato. Los errores internos de IndexedDB y los identificadores técnicos siguen en inglés.

## D017 — Verificación de reconexión por habilitación, no por sincronización

**Estado:** vigente
**Decisión:** Una reconexión que no se confirmó localmente (`INTENT_PERSISTED` o `PHYSICAL_UNKNOWN`) se verifica solo consultando su habilitación por `operationId` (`recoverReconnection`), desde el botón "Verificar con servidor" o al sincronizar. La cola de sincronización no la consulta en `/v1/sync/operations` ni la reintenta. Una consulta no concluyente conserva la causa original del registro.
**Consecuencia:** `/v1/sync/operations` solo se consulta para reconexiones confirmadas localmente. Una habilitación `expired`, `not_found` o no consultable deja la reconexión incierta con su código (`ENABLEMENT_RESERVATION_EXPIRED`, `ENABLEMENT_NOT_FOUND`, `ENABLEMENT_LOOKUP_UNKNOWN`) y sin envío. Resolver esos casos corresponde a la revisión del administrador, pendiente de la política de SEPSA (`TODO: VALIDAR CON SEPSA`).

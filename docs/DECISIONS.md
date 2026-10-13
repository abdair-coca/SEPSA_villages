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
**Consecuencia:** `/v1/sync/operations` solo se consulta para reconexiones confirmadas localmente. Una habilitación `expired`, `not_found` o no consultable deja la reconexión incierta con su código (`ENABLEMENT_RESERVATION_EXPIRED`, `ENABLEMENT_NOT_FOUND`, `ENABLEMENT_LOOKUP_UNKNOWN`) y sin envío. Cuando la consulta demuestra que la habilitación no se usó, el técnico la resuelve según D022; los demás casos siguen inciertos.

## D018 — Tamaño de la foto de evidencia

**Estado:** vigente
**Decisión:** La app prepara cada foto en ≤ 5 MP, ≤ 4096 px por lado (límite del backend) y ≤ 1 000 000 bytes (`EVIDENCE_MAX_BYTES`, `field-app/src/state/evidence.ts`). Conserva el original si ya cumple; si no, baja la calidad JPEG y después la resolución. Un PNG que no cabe se convierte a JPEG. Si ningún intento cabe, la captura se bloquea con `EVIDENCE_TOO_LARGE`. El backend desplegado acepta cuerpos de hasta 2 MB (`HTTP_MAX_BODY_BYTES` = 2097152), suficiente para la foto en base64.
**Consecuencia:** Con el límite anterior (1 MiB) una foto normal de móvil fallaba con `PAYLOAD_TOO_LARGE`, el corte no se enviaba y su autorización vencía. El hash SHA-256 y las dimensiones guardadas corresponden siempre a los bytes finales.

## D019 — Reintento idempotente del consumo de una autorización

**Estado:** vigente
**Decisión:** Si el consumo de una habilitación de un solo uso termina en resultado incierto (red, tiempo agotado de 15 s o 5xx), la app lo reintenta con el mismo `operationId` y token, con esperas de 1 s y 3 s (`consumeWithRetries`, `field-app/src/use-cases/consume-retry.ts`). Un 401 (`UNAUTHENTICATED`) no se reintenta. No hay límite por vigencia: el backend devuelve `consumed` al replay del mismo `operationId` aunque la habilitación haya vencido, y `not_enabled` si no se consumió, así que toda respuesta concluyente es verdadera.
**Consecuencia:** Una respuesta perdida deja de producir una reconexión incierta en la mayoría de los casos. Si los tres intentos fallan, la operación queda `PHYSICAL_UNKNOWN` con su causa y se verifica como en D017. Nunca se pide una habilitación nueva automáticamente.

## D020 — El corte consume su autorización al confirmar

**Estado:** vigente
**Decisión:** La autorización de corte se consume cuando el técnico confirma el corte (`POST /v1/authorizations/cut/consume`), con el reintento de D019, y no al aceptar la sincronización. El sync de un CUT acepta una autorización `CONSUMED` por esa misma operación sin volver a exigir vigencia. Una reserva `RESERVED` de una versión anterior de la app se sigue consumiendo en el sync, solo si no venció. `GET /v1/authorizations/cut/{operation_id}` permite verificar un consumo incierto.
**Consecuencia:** Antes, un corte físico ya hecho cuya sincronización llegaba después de `AUTHORIZATION_TTL_SECONDS` (300 s) era rechazado y quedaba sin registro en el servidor. Ahora el vencimiento solo limita el tiempo entre autorizar y confirmar. El backend se despliega antes que la app: acepta ambos flujos.

## D021 — Entrega documental como copia fechada

**Estado:** vigente
**Decisión:** La documentación de entrega para SEPSA vive en `docs/entrega-sepsa/`. Es una copia autocontenida y fechada, derivada de las fuentes activas (`docs/RULES.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/features/`, `docs/api/`, `docs/operations/` y el código). No reemplaza ninguna fuente activa.
**Consecuencia:** Cada documento de la entrega indica su fuente y su fecha. Un cambio en una fuente se refleja en la entrega en la misma tarea. Si la entrega y una fuente difieren, manda la fuente y la entrega se corrige. Los pendientes de SEPSA se listan en `docs/entrega-sepsa/14-pendientes-sepsa.md` y no se presentan como reglas oficiales.

## D022 — Nueva autorización cuando el servidor demuestra que la anterior no se usó

**Estado:** vigente
**Decisión:** Si la consulta de la autorización de un corte o una reconexión incierta devuelve `expired`, `rejected` o `not_found`, el técnico puede pedir una nueva tras confirmarlo. La app vuelve a consultar al servidor en ese momento; con la prueba, cierra la operación (`BLOCKED`, `AUTHORIZATION_CLOSED_NOT_CONSUMED`, fuera de la cola), devuelve la orden a su estado previo, registra una visita `closure-<uuid>` que se sincroniza como constancia y repite la acción con un `operationId` nuevo, la misma foto (copiada y ligada a la operación nueva) y los mismos datos (`demora`, captura de campo). `effectiveAt` es la hora de la nueva autorización. Un corte cuyo POST de sync ya empezó no se cierra así.
**Consecuencia:** Una orden no queda bloqueada sin salida cuando el servidor demuestra que la autorización no se consumió, y el técnico no recaptura datos. La prueba es sobre la autorización, no sobre el medidor: la interfaz no afirma que la acción física no ocurrió. El administrador no interviene. La consulta de reconexión informa `rejected` en lugar de `unknown`.

## D023 — El modo simulado no viaja en producción

**Estado:** vigente
**Decisión:** La autoridad simulada, los datos de demostración y su store (`SimulatedApp.tsx`, `bootstrap/simulated-runtime.ts`) se cargan con `import()` solo si `simulationEnabled()`: en desarrollo o con `VITE_ENABLE_SIMULATION=true`. El build de producción no los incluye; sin URL de backend ni simulación, la app muestra que no tiene servidor configurado. El CI construye el build de producción, comprueba que no contiene el modo simulado y después construye el build de humo con la bandera.
**Consecuencia:** Un evaluador nunca ve datos de demostración en el despliegue. Las pruebas de humo (`smoke:ui`, `smoke:pwa`) exigen el marcador `simulated-explicit`, que ahora requiere también la bandera.

## D024 — El administrador ve las operaciones por conciliar sin poder resolverlas

**Estado:** vigente
**Decisión:** `GET /v1/admin/reconciliation` (solo ADMIN) lista, a partir de tablas existentes, los conflictos de sincronización, las autorizaciones consumidas cuya operación aún no llegó del dispositivo y las operaciones cerradas porque su autorización no se usó (D022). La vista del administrador las muestra en solo lectura. El estado incierto de un dispositivo no se envía al servidor; esta lista es lo que el servidor puede saber.
**Consecuencia:** El administrador da seguimiento sin intervenir; el técnico verifica o pide una autorización nueva desde su dispositivo. `POST /v1/sync/operations/{id}/review` sigue existiendo sin interfaz.

## D025 — Sesión de 7 días en el despliegue

**Estado:** vigente
**Decisión:** `SESSION_TTL_SECONDS` vale `604800` (7 días) en `render.yaml` y en `backend/.env.example`, igual que el valor por defecto de `backend/src/config.ts`. La pantalla de acceso dice «La sesión dura 7 días». Sustituye a la sesión de 14 horas (`50400`, tarea 2.4 del plan de consolidación).
**Consecuencia:** Con la sesión vigente se trabaja sin conexión; entrar sí exige conexión (`docs/RULES.md`, Offline-first). Si la duración cambia, debe cambiar también el texto de la pantalla de acceso. Render aplica el valor al sincronizar el blueprint o al cambiar la variable en su panel.

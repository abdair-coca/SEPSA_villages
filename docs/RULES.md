# Reglas vigentes del proyecto

Este es el documento operativo principal para agentes. Si una regla aquí contradice código o una instrucción explícita y actual del equipo, registrar el conflicto antes de cambiar comportamiento crítico.

## Método de trabajo

- Leer solo `PROJECT.md`, este archivo, el feature relacionado y el código afectado.
- Tratar el código actual como evidencia de implementación; no asumir que un documento histórico sigue vigente.
- Hacer el cambio mínimo que resuelve la tarea. Reutilizar interfaces, casos de uso y componentes existentes.
- No crear abstracciones paralelas, refactors amplios ni nuevas dependencias sin necesidad concreta.
- Mantener las reglas críticas en dominio/casos de uso, no solo en componentes visuales.
- No modificar migraciones históricas para corregir datos actuales; agregar una migración nueva si corresponde.
- Añadir o ajustar pruebas cuando cambia comportamiento, estados, permisos, persistencia o sincronización.

## Reglas de producto

- Roles: `ADMIN` gestiona el piloto; `TECHNICIAN` consulta y opera solo órdenes asignadas a su identidad.
- Validar permisos en la capa autoritativa; ocultar un botón no es seguridad.
- Prioridad de entrega: una orden individual completa antes de ampliar operación masiva.
- No crear órdenes activas duplicadas para el mismo suministro y propósito.
- Toda asignación, anulación, autorización, ejecución y sincronización conserva actor, fecha, versión y resultado.
- Un corte físico exige autorización online concluyente, vigente y de un solo uso inmediatamente antes de ejecutarse.
- Timeout, ausencia de respuesta, `unknown`, conflicto o datos obsoletos bloquean; nunca autorizan por inferencia.
- Lectura final, GPS y evidencia deben ser reales y vinculados a orden, técnico, dispositivo y operación. Solo GPS/fotos tienen excepciones controladas y justificadas.

## Offline-first

- Primero validar localmente, persistir de forma durable y confirmar; después encolar y sincronizar.
- Información de trabajo debe sobrevivir recarga, cierre, reinicio y pérdida temporal de red.
- La cola usa identificadores únicos, estados `pending`, `syncing`, `synced`, `failed`, intentos y errores.
- No eliminar una operación hasta confirmación válida. Reintentos deben ser idempotentes.
- No usar “última escritura gana” para asignaciones, anulaciones, autorizaciones o resultados físicos.
- Conservar conflictos y resultados inciertos para revisión humana; no repetir automáticamente una acción física.

## Datos e integración

El producto activo conserva deuda, facturas y mora, sin procesar ni presentar pagos. Las columnas, tablas, migraciones y snapshots históricos permanecen intactos; la carga histórica de morosidad conserva columnas legacy sin darles comportamiento operativo; las proyecciones operativas omiten sus metadatos de pago y no reclasifican facturas.

- Excel, mocks y backend actual son provisionales; la API oficial de SEPSA aún no está definida.
- No inventar columnas, estados, tarifas, contratos ni endpoints oficiales. Marcar incertidumbres como `TODO: VALIDAR CON SEPSA`.
- Dinero: usar centavos enteros o decimal determinista.
- No guardar contraseñas en texto plano, secretos en frontend ni credenciales en documentación activa.
- Los mensajes de error deben decir qué quedó guardado y cuál es el siguiente paso.

## Reglas observadas pero no vigentes

Los documentos históricos describen umbral fijo de facturas/mora, exclusión de intereses, bloqueo por CI/NIT, protección por reclamos y cargos/prioridad de reconexión. El código actual no los establece como autoridad general. Mantenerlos como `TODO: VALIDAR CON SEPSA` hasta recibir confirmación y contrato; no implementarlos por inferencia.

## Antes de entregar

- Confirmar que la regla de negocio y permisos viven en la capa correcta.
- Verificar persistencia local y cola cuando apliquen.
- Probar el caso feliz y el fallo relevante: offline, reinicio, reintento, duplicado, conflicto o autorización incierta.
- Confirmar que la UI distingue guardado local, sincronización y resultado remoto.
- Actualizar solo la documentación activa afectada; no copiar el mismo concepto en varios archivos.

# Manual técnico: despliegue, respaldo y restauración

Fuente: `docs/operations/pilot-runbook.md` (fuente principal), `backend/Dockerfile`, `backend/docker-compose.yml`, `backend/scripts/apply-startup-schema-migrations.mjs`, `backend/migrations/`, `render.yaml`, `docs/api/pilot-contract.md`, `docs/DECISIONS.md` (D018, D023).
Fecha: 2026-10-12
Estado: entrega, copia fechada. Resume el procedimiento del piloto provisional. Si el runbook cambia, este manual se actualiza en la misma tarea.

Este manual sirve al equipo que despliega y opera el servidor del piloto. Los términos técnicos están en el [glosario](05-diccionario-datos.md#glosario-de-términos-y-estados). Las variables de entorno completas están en [08-manual-instalacion.md](08-manual-instalacion.md).

Antes de operar el piloto en producción faltan decisiones que no están en el repo: proveedor de nube, topología, TLS, rotación de credenciales, retención, objetivos de recuperación y registro de cambios operativos. Están listados como pendientes en la sección 6 y en [14-pendientes-sepsa.md](14-pendientes-sepsa.md) (P-11, P-17, P-18).

## 1. Despliegue

1. Construir y revisar la imagen desde una revisión aprobada:

   ```sh
   docker build -t sepsa-pilot-provisional:<revision> backend
   ```

2. Configurar en el gestor de secretos del entorno: `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SECURE=true`, `NODE_ENV=production` y `PORT`. Los valores secretos no van en la imagen, en el repositorio, en argumentos compartidos ni en los registros.

3. Aplicar el esquema base y las migraciones históricas necesarias según el historial confirmado del entorno. Las tablas `users` y `orders` deben existir antes de iniciar el contenedor.

   La imagen incluye `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql`. El script `scripts/apply-startup-schema-migrations.mjs` las aplica en ese orden antes del servidor, con operaciones idempotentes.

   Al arrancar, el comando de la imagen (`CMD` en `backend/Dockerfile`) ejecuta además, en este orden:

   1. `scripts/apply-startup-schema-migrations.mjs`
   2. `migrations/20261002-role-grants.mjs` (grants de roles)
   3. `dist/src/server.js` (servidor)

   La carga de datos de prueba no está en el arranque desde D026. Se ejecuta a mano (sección 1.1).

   `008_reconnection_schema.sql` habilita la reconexión sobre tablas existentes. El arranque no aplica `003_payment_observations.sql`. Revisar el historial y el conjunto de datos antes del despliegue, sin ejecutar importaciones ni semillas adicionales.

4. Arrancar una instancia nueva y verificar:

   - `GET /healthz`, que debe responder `status: ok`;
   - un inicio de sesión de prueba autorizado;
   - la cookie segura;
   - la lectura del paquete de trabajo;
   - una escritura de auditoría en una ventana controlada.

5. Registrar la revisión de la imagen y el resultado de la migración en el registro de cambio operativo. Ese registro todavía no está definido en el repo (P-17).

TLS, proxy confiable, réplicas, almacén compartido del límite de intentos, observabilidad, umbrales, retención y gestión de secretos dependen de infraestructura que no está definida (P-11).

En Compose, los archivos SQL montados en `/docker-entrypoint-initdb.d`, incluida la migración de evidencias, solo se ejecutan sobre un volumen de PostgreSQL vacío. Un volumen existente recibe `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql` mediante el arranque de la API; no hace falta borrar el volumen. Si una migración falla, el `CMD` no continúa hacia los grants de roles ni hacia el servidor.

### 1.1 Carga de datos de prueba (manual)

Desde D026 la carga `migrations/20260923-load-excel-20260922.mjs` ya no se ejecuta al arrancar el contenedor. Se hace a mano con `npm run pilot:migrate:field-test`. Según el script:

- Valida el conjunto de datos `backend/migrations/data/EXCEL_20260922.json`, que no está en el repo: 99 registros y 10 elegibles, es decir, con `debt_cents > 0` y `months_pending >= 3`. Si no se cumple, el comando falla.
- Antes de escribir, consulta la tabla `pilot_migrations`. Si la carga ya se aplicó con el mismo checksum, sale sin escribir nada. Si el checksum cambió, el comando falla.
- En la primera aplicación actualiza cada moroso con el mismo `debtor_id` (`ON CONFLICT DO UPDATE`) y sobrescribe campos como `debt_cents`, `months_pending` y `address` con los valores del conjunto de datos.
- Para cada elegible crea una orden de corte en estado `GENERADO`, asignada al técnico `jhonny.moya` y creada por `admin.sepsa`. Los nombres de usuario están fijos en el script. Registra la auditoría de creación y de asignación.
- Las órdenes no se duplican: el identificador se calcula de forma determinista y la inserción se omite si ya existe.

Consecuencias que el equipo debe decidir antes de operar en producción:

- Solo la primera aplicación escribe. Una segunda ejecución con el mismo archivo no cambia nada.
- El umbral de 3 meses está codificado. `docs/RULES.md` lo marca como no vigente y pide no implementarlo por inferencia (P-01).
- El conjunto de datos se retiró del repo (D026). Sin el archivo, el comando se detiene con un mensaje que lo indica. Los seeds `005` y `006` siguen en el repo con filas de personas; su tratamiento está pendiente de decisión.

El código de la carga no cambió; cambió dónde se ejecuta. Esta sección describe lo que hace el código hoy.

## 2. Reversión segura

1. Detener el despliegue progresivo si fallan la verificación de salud o las verificaciones funcionales.
2. Volver a la imagen anterior conocida y verificar `GET /healthz`, el inicio de sesión, la consulta, la sincronización y la auditoría.
3. Conservar las migraciones aditivas ya aplicadas. La reversión del código no requiere borrar `evidence_assets` ni `work_package_versions`. No ejecutar `DROP`, truncado, restauración sobre producción ni migración inversa automática.
4. Si los datos o el esquema presentan una inconsistencia, congelar las escrituras afectadas y usar una restauración aislada con conciliación operativa. El proceso de aprobación y la ventana de mantenimiento dependen de la infraestructura, que no está definida.

## 3. Respaldo

Usar credenciales de solo respaldo, administradas fuera del repositorio, y destinos cifrados con acceso restringido. El proveedor, la frecuencia y la retención no están definidos (P-11).

```sh
pg_dump --format=custom --no-owner --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.contents.txt"
```

Verificar el código de salida, que el tamaño no sea cero, la lista de objetos esperados (`users`, `orders`, `audit_events`, `evidence_assets`, `work_package_versions`) y la huella del archivo registrada en un almacenamiento operativo aprobado.

La evidencia fotográfica está en la base de datos en este piloto. Su retención oficial está pendiente (P-18).

## 4. Restauración verificada

1. Crear una base temporal aislada, vacía y protegida. Nunca restaurar sobre producción para una prueba.
2. Restaurar el respaldo:

   ```sh
   pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
   ```

3. Ejecutar `SELECT COUNT(*)` sobre las tablas críticas. Verificar restricciones e índices con `pg_catalog`, comprobar las referencias de las evidencias a operaciones y órdenes, y revisar que la auditoría sea solo de escritura adicional (append-only): que admita nuevas filas y no permita modificar las existentes.
4. Arrancar un servidor temporal contra esa base y comprobar `/healthz`, un inicio de sesión sintético, la lectura de órdenes, la auditoría paginada, el paquete de trabajo y la lectura y verificación de la huella de una evidencia sintética, cuando esté disponible.
5. Comparar los conteos por tabla y la huella del archivo con el registro del respaldo. Guardar el resultado y eliminar solo la base temporal, con el procedimiento del proveedor. No ejecutar comandos destructivos con URL de producción.

Los objetivos RPO y RTO, la frecuencia de restauración, el cifrado administrado y la retención necesitan valores aprobados (P-17).

## 5. Conciliación de pendientes

- Revisar las operaciones en conflicto y las `PHYSICAL_UNKNOWN` desde las consultas y la auditoría. Conservar la operación, el actor, el dispositivo, la versión y el motivo.
- Por la interfaz, el administrador consulta en solo lectura las operaciones por conciliar (`GET /v1/admin/reconciliation`, D024). La revisión con motivo (`POST /v1/sync/operations/{operation_id}/review`) solo existe como API.
- Confirmar que las referencias de evidencia correspondan a la orden y a la operación, y comparar la huella almacenada. No borrar evidencias para resolver discrepancias.
- Resolver los resultados inciertos solo con el procedimiento humano vigente, dejando el motivo y la auditoría. Nunca repetir una acción física ni inferir una autorización.
- Un técnico puede pedir una autorización nueva cuando el servidor demuestra que la anterior no se usó (D022). El administrador no interviene en ese caso.

## 6. Pendientes de este manual

| Tema | Pendiente | Referencia |
|---|---|---|
| Proveedor, topología, TLS, rotación de secretos, almacén compartido del límite de intentos | No definido | P-11 |
| Registro de cambio operativo | No definido en el repo | P-17 |
| Retención de evidencias y respaldos | Pendiente de SEPSA | P-18 |
| RPO, RTO, frecuencia de restauración y cifrado administrado | Valores aprobados pendientes | P-17 |
| Política de conciliación oficial | Pendiente de SEPSA | P-03, P-04 |
| Carga de datos de prueba: la primera ejecución crea órdenes de prueba con umbral de 3 meses y está fijada a usuarios concretos | Ya no se ejecuta al arrancar (D026). Pendiente: tratamiento de los seeds `005` y `006` | Sección 1.1; P-01 |

## 7. Material para el técnico de campo

La guía de campo del piloto para técnicos, con y sin conexión, está en [guia-de-campo.md](../operations/guia-de-campo.md). Sustituye al PDF retirado. Las reglas de corte siguen en `docs/RULES.md`, y el resumen para el técnico está en [09-manual-usuario.md](09-manual-usuario.md).

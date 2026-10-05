# Runbook del piloto provisional

Este runbook cubre operación del backend piloto y procedimientos verificables con la arquitectura actual. Proveedor cloud, topología, TLS, rotación de credenciales, retención y objetivos de recuperación siguen sin definirse; completar esos valores antes de operación productiva. Reglas oficiales y conciliación de SEPSA: `TODO: VALIDAR CON SEPSA`.

## Despliegue

1. Construir y revisar imagen desde una revisión aprobada: `docker build -t sepsa-pilot-provisional:<revision> backend`.
2. Configurar `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SECURE=true`, `NODE_ENV=production` y `PORT` en el gestor de secretos del entorno. No poner valores secretos en imagen, repositorio, argumentos compartidos o logs.
3. Aplicar esquema base y migraciones históricas requeridas según el historial confirmado del entorno; `users` y `orders` deben existir antes de iniciar el contenedor. La imagen incluye `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql`; `scripts/apply-startup-schema-migrations.mjs` las aplica en ese orden antes del servidor, con operaciones idempotentes. `008_reconnection_schema.sql` habilita el estado RECONEXIÓN y la acción de sync sobre tablas existentes. El arranque no aplica `003_payment_observations.sql`. El CMD actual también ejecuta la carga provisional idempotente `20260923-load-excel-20260922.mjs` después de esas migraciones; revisar su historial y dataset antes del despliegue, sin ejecutar imports ni semillas adicionales.
4. Arrancar instancia nueva y verificar `GET /healthz` (`status: ok`), login de prueba autorizado, cookie segura, lectura de paquete y escritura de auditoría en ventana controlada.
5. Registrar revisión de imagen y resultado de migración en el registro de cambio operativo existente. Ese registro aún no está definido en el repo.

TLS, proxy confiable, réplicas, almacén compartido de rate limit, observabilidad, umbrales, retención y proceso de secretos dependen de infraestructura no definida.

En Compose, los SQL montados en `/docker-entrypoint-initdb.d`, incluida la migración de evidencia, se ejecutan solo sobre un volumen PostgreSQL vacío. Un volumen existente recibe `002_evidence_assets.sql`, `007_work_package_versions.sql` y `008_reconnection_schema.sql` por el arranque de la API; no hace falta borrar el volumen. Si una migración falla, el CMD no continúa hacia la carga provisional ni el servidor.

## Rollback seguro

1. Detener despliegue progresivo si health check o verificaciones funcionales fallan.
2. Volver a imagen anterior conocida y verificar `GET /healthz`, login, consulta, sincronización y auditoría.
3. Conservar migraciones aditivas aplicadas. El rollback de código no requiere borrar `evidence_assets` ni `work_package_versions`; no ejecutar `DROP`, truncado, restauración encima de producción ni migración inversa automática.
4. Si datos o esquema presentan inconsistencia, congelar escrituras afectadas y usar restauración aislada más conciliación operativa. El proceso de aprobación y ventana de mantenimiento requiere definición de infraestructura.

## Backup

Usar credenciales de solo backup administradas fuera del repositorio y destinos cifrados con acceso restringido. El proveedor, frecuencia y retención no están definidos.

```sh
pg_dump --format=custom --no-owner --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.contents.txt"
```

Verificar código de salida, tamaño no vacío, lista de objetos esperados (`users`, `orders`, `audit_events`, `evidence_assets`, `work_package_versions`) y checksum registrado en almacenamiento operativo aprobado. La evidencia fotográfica está en base de datos en este piloto; retención oficial: `TODO: VALIDAR CON SEPSA`.

## Restauración verificada

1. Crear base temporal aislada, vacía y protegida; nunca restaurar sobre producción para una prueba.
2. Restaurar backup con `pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"`.
3. Ejecutar `SELECT COUNT(*)` sobre tablas críticas, verificar constraints e índices con `pg_catalog`, comprobar referencias de assets a operaciones/órdenes y revisar auditoría append-only.
4. Arrancar backend temporal contra esa base y comprobar `/healthz`, login sintético, lectura de órdenes, auditoría paginada, paquete y lectura/verificación de hash de una evidencia sintética cuando esté disponible.
5. Comparar conteos por tabla y checksum del archivo con el registro del backup; guardar el resultado y destruir únicamente la base temporal mediante el procedimiento del proveedor. No ejecutar comandos destructivos en URL de producción.

RPO, RTO, frecuencia de restauración, cifrado administrado y retención necesitan valores aprobados.

## Conciliación de pendientes

- Revisar operaciones `conflict` y `PHYSICAL_UNKNOWN` desde consultas y auditoría; conservar operación, actor, dispositivo, versión y motivo.
- Confirmar que referencias de evidencia correspondan a la orden y operación; comparar hash almacenado. No borrar evidencia para resolver discrepancias.
- Resolver resultados inciertos solo mediante el procedimiento humano vigente, dejando razón y auditoría. Nunca reintentar una acción física ni inferir autorización.

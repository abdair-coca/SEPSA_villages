# Runbook del piloto provisional

Este runbook cubre operación del backend piloto y procedimientos verificables con la arquitectura actual. Proveedor cloud, topología, TLS, rotación de credenciales, retención y objetivos de recuperación siguen sin definirse; completar esos valores antes de operación productiva. Reglas oficiales y conciliación de SEPSA: `TODO: VALIDAR CON SEPSA`.

## Despliegue

1. Construir y revisar imagen desde una revisión aprobada: `docker build -t sepsa-pilot-provisional:<revision> backend`.
2. Configurar `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SECURE=true`, `NODE_ENV=production` y `PORT` en el gestor de secretos del entorno. No poner valores secretos en imagen, repositorio, argumentos compartidos o logs.
3. Aplicar esquema base y migraciones aditivas según el historial confirmado del entorno. El contenedor aplica `007_work_package_versions.sql` antes de arrancar; migraciones históricas de esquema deben estar instaladas por el procedimiento de la instalación existente. No ejecutar imports ni semillas de Excel como parte de despliegue.
4. Arrancar instancia nueva y verificar `GET /healthz` (`status: ok`), login de prueba autorizado, cookie segura, lectura de paquete y escritura de auditoría en ventana controlada.
5. Registrar revisión de imagen y resultado de migración en el registro de cambio operativo existente. Ese registro aún no está definido en el repo.

TLS, proxy confiable, réplicas, almacén compartido de rate limit, observabilidad, umbrales, retención y proceso de secretos dependen de infraestructura no definida.

## Rollback seguro

1. Detener despliegue progresivo si health check o verificaciones funcionales fallan.
2. Volver a imagen anterior conocida y verificar `GET /healthz`, login, consulta, sincronización y auditoría.
3. Conservar migraciones aditivas aplicadas. El rollback de código no requiere borrar `work_package_versions`; no ejecutar `DROP`, truncado, restauración encima de producción ni migración inversa automática.
4. Si datos o esquema presentan inconsistencia, congelar escrituras afectadas y usar restauración aislada más conciliación operativa. El proceso de aprobación y ventana de mantenimiento requiere definición de infraestructura.

## Backup

Usar credenciales de solo backup administradas fuera del repositorio y destinos cifrados con acceso restringido. El proveedor, frecuencia y retención no están definidos.

```sh
pg_dump --format=custom --no-owner --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.contents.txt"
```

Verificar código de salida, tamaño no vacío, lista de objetos esperados (`users`, `orders`, `audit_events`, `evidence_assets`, `payment_observations`, `work_package_versions`) y checksum registrado en almacenamiento operativo aprobado. La evidencia fotográfica está en base de datos en este piloto; retención oficial: `TODO: VALIDAR CON SEPSA`.

## Restauración verificada

1. Crear base temporal aislada, vacía y protegida; nunca restaurar sobre producción para una prueba.
2. Restaurar backup con `pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"`.
3. Ejecutar `SELECT COUNT(*)` sobre tablas críticas, verificar constraints e índices con `pg_catalog`, comprobar referencias de assets a operaciones/órdenes y revisar pagos/auditoría append-only.
4. Arrancar backend temporal contra esa base y comprobar `/healthz`, login sintético, lectura de órdenes, auditoría paginada, paquete y lectura/verificación de hash de una evidencia sintética cuando esté disponible.
5. Comparar conteos por tabla y checksum del archivo con el registro del backup; guardar el resultado y destruir únicamente la base temporal mediante el procedimiento del proveedor. No ejecutar comandos destructivos en URL de producción.

RPO, RTO, frecuencia de restauración, cifrado administrado y retención necesitan valores aprobados.

## Conciliación de pendientes

- Revisar operaciones `conflict` y `PHYSICAL_UNKNOWN` desde consultas y auditoría; conservar operación, actor, dispositivo, versión y motivo.
- Confirmar que referencias de evidencia correspondan a la orden y operación; comparar hash almacenado. No borrar evidencia para resolver discrepancias.
- Consultar eventos en `payment_observations` como observaciones del adapter de prueba/provisional. No tratarlos como ledger oficial ni registrar pagos desde el flujo técnico.
- Resolver resultados inciertos solo mediante el procedimiento humano vigente, dejando razón y auditoría. Nunca reintentar una acción física ni inferir pago o autorización.
- Fuente de pagos, identidad de eventos, precedencia, ventanas, responsables y evidencia exigible: `TODO: VALIDAR CON SEPSA`.

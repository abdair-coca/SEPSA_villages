# 07. Manual técnico: despliegue, respaldo y restauración

Fuente: `backend/Dockerfile`, `backend/docker-compose.yml`, scripts de arranque en `backend/scripts/` y `backend/migrations/`, `render.yaml`, y el runbook de operación del piloto.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Resume el procedimiento del piloto. La infraestructura de producción la define SEPSA (ver la lista de pendientes).

## 1. Despliegue

1. Construir la imagen desde una revisión aprobada: `docker build -t sepsa-pilot-provisional:<revision> backend`.
2. Configurar en el gestor de secretos: `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SECURE=true`, `NODE_ENV=production` y `PORT`. Los secretos no van en la imagen ni en el repositorio.
3. Al arrancar, el contenedor aplica en orden las migraciones de arranque (`002`, `007_work_package_versions` y `008`, de forma idempotente), los grants de roles y después el servidor. Si una migración falla, el servidor no arranca.
4. Verificar: `GET /healthz` responde `status: ok`, un inicio de sesión de prueba funciona, la cookie es segura, el paquete de trabajo se lee y la auditoría registra escrituras.
5. Registrar la revisión de la imagen y el resultado de la migración en el registro de cambios operativos.

## 2. Carga de datos de prueba

La carga de datos de prueba no se ejecuta al arrancar. Se ejecuta a mano con `npm run pilot:migrate:field-test`. Requiere un archivo de datos que no está en el repo. Antes de escribir, consulta la tabla `pilot_migrations`; con el mismo contenido, no escribe nada. Los seeds `005` y `006` tienen filas de personas (ver la lista de pendientes).

## 3. Reversión

1. Detener el despliegue si fallan la verificación de salud o las pruebas funcionales.
2. Volver a la imagen anterior y verificar `/healthz`, el inicio de sesión, la sincronización y la auditoría.
3. Conservar las migraciones aplicadas. No ejecutar `DROP`, truncados ni migraciones inversas automáticas.
4. Ante una inconsistencia de datos, congelar las escrituras afectadas y restaurar en una base aislada.

## 4. Respaldo

Usar credenciales de solo respaldo, guardadas fuera del repositorio, y destinos cifrados con acceso restringido.

```sh
pg_dump --format=custom --no-owner --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.contents.txt"
```

Verificar el código de salida, que el archivo no esté vacío, las tablas críticas y la huella del archivo. El repo no implementa respaldos automáticos; la frecuencia, el cifrado y la retención los define SEPSA.

## 5. Restauración verificada

1. Crear una base temporal aislada. Nunca restaurar sobre producción para una prueba.
2. Restaurar con `pg_restore --exit-on-error --no-owner --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"`.
3. Contar filas de las tablas críticas, verificar restricciones e índices, y comprobar que la auditoría solo admite escrituras adicionales.
4. Arrancar un servidor temporal contra esa base y comprobar `/healthz`, un inicio de sesión sintético y la lectura de órdenes.
5. Comparar los conteos con el registro del respaldo y eliminar solo la base temporal.

## 6. Conciliación

El administrador revisa en solo lectura las operaciones por conciliar. La revisión con motivo existe solo como API. Las fotos no se borran para resolver discrepancias, y nunca se repite una acción física ni se infiere una autorización.

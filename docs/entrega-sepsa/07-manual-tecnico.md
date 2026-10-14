# 07. Manual técnico: despliegue, respaldo y restauración

Fuente: `backend/Dockerfile`, `backend/docker-compose.yml`, scripts de arranque en `backend/scripts/` y `backend/migrations/`, `render.yaml`, y el runbook de operación del piloto.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Resume el procedimiento del piloto. La infraestructura de producción la define SEPSA (ver pendientes). Pasos completos en el anexo A07.

## 1. Despliegue

1. Construir la imagen de una revisión aprobada: `docker build -t sepsa-pilot-provisional:<revision> backend`.
2. Configurar los secretos en el gestor: `DATABASE_URL`, `CORS_ORIGIN`, `COOKIE_SECURE=true`, `NODE_ENV=production` y `PORT`. Ningún secreto va en la imagen ni en el repo.
3. Al arrancar se aplican las migraciones de arranque (`002`, `007_work_package_versions` y `008`), de forma idempotente, y luego los grants de roles. Si una migración falla, el servidor no arranca.
4. Verificar `GET /healthz` (`status: ok`), un inicio de sesión de prueba, la cookie segura, la lectura del paquete de trabajo y la auditoría.
5. Registrar la revisión de la imagen y el resultado de la migración.

La carga de datos de prueba no se ejecuta al arrancar: se lanza a mano con `npm run pilot:migrate:field-test`, desde un archivo fuera del repo.

## 2. Reversión

Si fallan la verificación o las pruebas funcionales, se detiene el despliegue y se vuelve a la imagen anterior. Las migraciones aplicadas se conservan: no se ejecutan `DROP`, truncados ni migraciones inversas. Ante una inconsistencia se congelan las escrituras afectadas y se restaura en una base aislada.

## 3. Respaldo y restauración

El respaldo se hace con `pg_dump` en formato custom y se verifica con `pg_restore --list`. El repo no implementa respaldos automáticos; frecuencia, cifrado y retención los define SEPSA. La restauración se prueba siempre en una base temporal aislada, con `pg_restore --exit-on-error`, y se comprueban conteos, restricciones y el arranque de un servidor temporal.

## 4. Conciliación

El administrador revisa en solo lectura las operaciones por conciliar. La revisión con motivo existe solo como API. Las fotos no se borran para resolver discrepancias, y nunca se repite una acción física ni se infiere una autorización.

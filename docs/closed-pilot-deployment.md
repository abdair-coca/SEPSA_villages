# Despliegue del piloto cerrado

## Arquitectura gratuita

- **Vercel Hobby:** PWA estática en `field-app`.
- **Render Free:** API Docker en `backend`.
- **Neon Free:** PostgreSQL.

El plan gratuito no ofrece red privada ni lista de IP para el servicio web. El piloto queda restringido por autenticación de aplicación y URL no pública; no debe usarse para ejecutar cortes reales ni cargar secretos institucionales.

Render Free puede suspender el API después de inactividad. Neon Free puede suspender PostgreSQL después de cinco minutos y tiene límites mensuales. Esto es aceptable para una demostración controlada, no para operación continua.

## Orden de configuración

1. Crear proyecto PostgreSQL gratuito en Neon.
2. Copiar la URL directa de Neon solo para bootstrap local. Usar URL pooled para el API cuando Neon la entregue.
3. En el repositorio, ejecutar desde `backend`:

   ```powershell
   $env:DATABASE_URL="<NEON_DIRECT_DATABASE_URL>"
   npm run pilot:bootstrap
   Remove-Item Env:DATABASE_URL
   ```

4. Crear Blueprint en Render usando `render.yaml` y completar `DATABASE_URL` con la URL PostgreSQL.
5. Confirmar que Render publica el servicio como `sepsa-pilot-api.onrender.com`. Si genera otro hostname, actualizar `field-app/vercel.json` antes de desplegar frontend.
6. Desplegar `field-app` en Vercel desde su directorio raíz:

   ```powershell
   vercel login
   vercel --prod
   ```

7. Copiar URL HTTPS final de Vercel y establecerla como `CORS_ORIGIN` en Render.
8. Re-crear el despliegue de Render y verificar `https://<api>/healthz`.
9. Re-crear el despliegue de Vercel si se modificó `vercel.json`.

## Carga controlada para prueba de campo

La carga del archivo `Listado_de_clientes_al_22_09_2026 (1).xlsx` no se ejecuta automáticamente durante el despliegue. Desde `backend`, con la base provisional accesible, validar primero y luego ejecutar la sustitución explícita:

```powershell
$env:DATABASE_URL="<DATABASE_URL>"
python scripts/import-debtors-xlsx.py "C:\ruta\Listado_de_clientes_al_22_09_2026 (1).xlsx" --dataset EXCEL_20260922 --dry-run
python scripts/import-debtors-xlsx.py "C:\ruta\Listado_de_clientes_al_22_09_2026 (1).xlsx" --dataset EXCEL_20260922 --replace-pilot --create-cut-orders --assign-technician jhonny.moya
```

La sustitución elimina datos operativos `PILOT_PROVISIONAL` anteriores, conserva usuarios, carga 99 clientes y crea 10 órdenes elegibles (`DEUDA > 0` y `MESES >= 3`) asignadas a `jhonny.moya`. No ejecutar sobre una base institucional o con datos fuera del piloto.

## Verificación mínima

- API responde `200` en `/healthz`.
- Frontend abre por HTTPS y muestra entorno `PILOT_PROVISIONAL`.
- Login administrativo funciona.
- Búsqueda devuelve datos de referencia.
- Creación y asignación de orden funcionan.
- Técnico solo recibe órdenes asignadas.
- Visita offline sobrevive recarga.
- Operación pendiente permanece visible si Render está dormido o no hay conexión.

No usar `sql/005_definitive_seed.sql` manualmente después de iniciar el piloto: elimina usuarios, órdenes, asignaciones, autorizaciones, sincronización y auditoría provisionales. El comando `pilot:bootstrap` se niega a ejecutarse sobre una base con datos.

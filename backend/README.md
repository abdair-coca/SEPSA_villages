# Backend del piloto provisional

API REST Node.js/TypeScript + PostgreSQL para validar el flujo administrativo y técnico. No es la API oficial de SEPSA ni debe recibir secretos institucionales o datos reales sin autorización.

## Desarrollo local

1. Copia `.env.example` a `.env` y configura `DATABASE_URL`.
2. Instala dependencias: `npm install`.
3. Levanta el servidor: `npm run dev`.

También puedes usar `docker compose up --build`; publica PostgreSQL en `15432` y la API en `8080` con valores provisionales.

## Datos y migraciones

- `npm run pilot:bootstrap` inicializa una base vacía y se niega a borrar datos existentes.
- `npm run pilot:field-test` importa un workbook mediante el script de carga.
- `npm run pilot:migrate:field-test` aplica la carga idempotente del dataset de prueba disponible.
- Las migraciones históricas se ejecutan en orden; no las edites para corregir datos actuales.
- El importador conserva filas originales y no inventa GPS, fechas o significados de columnas.

## Seguridad del piloto

- Configura `CORS_ORIGIN` con el origen exacto; no uses `*` fuera de desarrollo local.
- Las sesiones se validan en backend. No guardes contraseñas en texto plano ni credenciales de prueba fuera del entorno local.
- Las operaciones y autorizaciones usan identificadores/idempotencia; la auditoría conserva actor y resultado.
- Las fotos se mantienen localmente; el payload de sync actual envía referencias y metadatos, no bytes.

## Verificación

```powershell
npm run build
npm test
```

La integración de la API oficial, el contrato de evidencia y las políticas definitivas de SEPSA siguen pendientes.

# Propuesta: Backend provisional productivo

## Intención

Agregar backend REST y PostgreSQL para reemplazar la autoridad IndexedDB `SIMULATED` sin acoplar el dominio del `field-app` a una API futura de SEPSA.

## Alcance

Incluye:

- API REST versionada bajo `/v1`.
- Autenticación provisional con sesiones revocables.
- Autorización por rol en servidor.
- Búsqueda de deudores y gestión individual de órdenes.
- Descarga filtrada por técnico y dispositivo.
- Autorización online one-use para corte.
- Recepción idempotente de operaciones y auditoría.
- PostgreSQL, migraciones y datos demo explícitamente provisionales.

No incluye:

- Contrato oficial o credenciales de SEPSA.
- Interpretación definitiva del Excel.
- Cobranza, creación masiva o nuevas reconexiones.
- Despliegue en infraestructura institucional.

## Regla de provisionalidad

Todos los endpoints, tablas, credenciales y datos de este cambio son `PILOT_PROVISIONAL`. Deben reemplazarse o validarse antes de operar con datos reales.

## Criterios de éxito

- El servidor rechaza acceso entre roles y técnicos.
- Comandos administrativos y sincronización son idempotentes.
- Una autorización de corte solo puede consumirse una vez.
- Conflictos no sobrescriben historial ni se resuelven por última escritura.
- PWA puede conservar trabajo offline y sincronizarlo después.

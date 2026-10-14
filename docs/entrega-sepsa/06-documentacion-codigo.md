# 06. Documentación del código fuente

Fuente: estructura de `backend/` y `field-app/`, tabla de rutas `backend/src/http/router.ts`, contrato OpenAPI y pruebas de arquitectura.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe el código de `main` al 2026-10-12. Mapa completo de carpetas en el anexo A06.

- **Estructura:** `field-app/` (aplicación de campo y administración, React y TypeScript), `backend/` (servidor, Node.js y PostgreSQL), `backend/sql/` (migraciones `001` a `008`), `backend/migrations/`, `backend/openapi/` y `.github/workflows/`.
- **Aplicación de campo:** organizada en dominio, puertos, casos de uso, adaptadores (IndexedDB, HTTP, navegador y simulado), estado, pantallas y componentes.
- **Servidor:** organizado en transporte, controladores, servicios, repositorios y base. La regla de dependencia es `controladores → servicios → repositorios → base de datos`. Excepción documentada: morosos y auditoría llaman directamente al repositorio, porque no tienen reglas de negocio.
- **Rutas:** 24 en total, 3 públicas y 21 con sesión. La tabla de rutas coincide con el contrato OpenAPI; su permiso por rol está en el documento 12.
- **Convenciones verificadas:** las capas no se saltan (pruebas de arquitectura); la tabla de rutas coincide con OpenAPI (`router.test.ts`); los invariantes críticos (autorización de un solo uso, cola, idempotencia) están comentados junto al código; códigos de error en inglés y mensajes en español; importes en centavos enteros.
- **Discrepancias conocidas:** en la aplicación, 5 de 88 archivos no tienen el comentario de cabecera (en el servidor, todos lo tienen). El modo simulado solo existe en desarrollo o con la variable explícita.

# 10. Plan de pruebas

Fuente: scripts de `backend/package.json` y `field-app/package.json`, `.github/workflows/ci.yml`, y las pruebas de `backend/test/` y `field-app/src/`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Los resultados de una ejecución están en el documento 11. Los criterios de aceptación son una propuesta: SEPSA todavía no los aprueba. Detalle en el anexo A10.

## 1. Estrategia

De lo interno a lo externo: dominio y casos de uso del servidor; persistencia en PostgreSQL; dominio y estado de la app; componentes; humo en navegador real; y un recorrido conectado. Cada caso crítico prueba el camino feliz y al menos un fallo: sin conexión, reinicio, reintento, duplicado, conflicto o autorización incierta.

## 2. Suites

Hay 13 suites (S1 a S13), agrupadas en 8 filas del anexo: servidor (unitarias, integración, migración de prueba, compilación y OpenAPI, y recorrido conectado con PostgreSQL en el CI), app de campo (reglas, cola, sincronización, IndexedDB y componentes, builds de producción y con simulación), humos de interfaz y PWA, y la guarda de los scripts de humo. El CI de referencia usa Ubuntu 24.04, Node 22.12.0 y PostgreSQL 16.4.

## 3. Cobertura

La cobertura por requisito (RF-01 a RF-36) está en el anexo. Los casos sin cobertura o parciales son: anulación (RF-07, no implementada); RF-29 (fuera del sistema); RF-36 (pendiente de verificar); y parcial en RF-09/RF-10 (falta el 403 de técnico en `/v1/audit`), RF-14 (falta la lectura negativa), RF-16, RF-19, RF-34.

## 4. Criterios de aceptación propuestos

Son 17 criterios (CA-01 a CA-17), cada uno ligado a requisitos y a un test existente: autorización, cola sin confirmación, respuesta perdida, foto verificada, reconexión con habilitación de un solo uso, conciliación solo en lectura, mensajes de error y nueva autorización. Pendientes de aprobación de SEPSA.

## 5. Escenarios de fallo

Sin conexión, reinicio, reintento, duplicado, conflicto y autorización incierta están cubiertos. Una escritura local que falla a mitad revierte operación, orden y cola juntas; una auditoría que falla en un cambio de rol revierte el cambio. Queda parcial el borrado local al cerrar sesión: no se prueba qué datos de trabajo quedan.

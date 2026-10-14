# Anexo A10. Plan de pruebas

Fuente: scripts de `backend/package.json` y `field-app/package.json`, `.github/workflows/ci.yml`, y las pruebas de `backend/test/` y `field-app/src/`.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Los resultados de una ejecución están en los resultados de pruebas. Los criterios de aceptación son una propuesta: SEPSA todavía no los aprueba.

## 1. Estrategia

De lo interno a lo externo: dominio y casos de uso del servidor; persistencia en PostgreSQL; dominio y estado de la app; componentes; humo en navegador real; y un recorrido conectado (servidor, base, app y navegador). Cada caso crítico prueba el camino feliz y al menos un fallo: sin conexión, reinicio, reintento, duplicado, conflicto o autorización incierta.

## 2. Suites

| ID | Suite | Qué prueba | Dónde corre |
|---|---|---|---|
| S1–S3 | Servidor: unitarias, integración y completa | Casos de uso, rutas, contrato, reconexión, persistencia y arquitectura | Job del CI con PostgreSQL |
| S4 | Migración de prueba | Aplica los SQL del piloto a la base de prueba | Job del CI con PostgreSQL |
| S5–S6 | Compilación del servidor y OpenAPI | Build sin errores y JSON válido | Job del CI con PostgreSQL |
| S7 | Recorrido conectado | Servidor, app y navegador headless | Job del CI con PostgreSQL |
| S8 | App de campo | Reglas, cola, sincronización, reconexión, IndexedDB y componentes | Job de la app |
| S9–S10 | Build de producción y con simulación | Sin marcadores de simulación en producción | Job de la app |
| S11–S12 | Humos de interfaz y PWA | Flujo de administrador y de campo; cola sin conexión y recuperación | Job de la app |
| S13 | Guarda de los scripts de humo | Verifica el build simulado | Fuera del CI |

El CI de referencia usa Ubuntu 24.04, Node 22.12.0 y PostgreSQL 16.4.

## 3. Cobertura por requisito

**Cubierto**: hay pruebas del comportamiento. **Parcial**: falta una parte, que se indica. **Sin cobertura**: no hay pruebas.

| RF | Estado | Observación |
|---|---|---|
| RF-01 a RF-06 | Cubierto | Roles, técnico solo con sus órdenes, duplicados y versiones |
| RF-07 | Sin cobertura | Anulación no implementada |
| RF-08 | Cubierto | Auditoría de acciones y de cambios de rol |
| RF-09, RF-10 | Parcial | Falta el 403 para técnico en `/v1/audit` |
| RF-11 a RF-13 | Cubierto | Descarga sin conexión, visita y reglas del corte |
| RF-14 | Parcial | Falta la prueba de lectura negativa |
| RF-15 | Cubierto | GPS y excepción con motivo |
| RF-16 | Parcial | El valor de 1 MB no aparece como literal en las pruebas |
| RF-17, RF-18 | Cubierto | Autorización, bloqueos y consumo al confirmar |
| RF-19 | Parcial | Los 15 s de espera no tienen prueba |
| RF-20 a RF-28 | Cubierto | Consultas inciertas, conciliación, reconexión y nueva autorización |
| RF-23 | Cubierto | Solo como API |
| RF-29 | Sin cobertura | Fuera del sistema |
| RF-30 a RF-33 | Cubierto | Cola, reinicio, foto verificada y respuesta perdida |
| RF-34 | Parcial | Hay atomicidad; falta la prueba de solo escritura adicional |
| RF-35 | Cubierto | Mensajes de error |
| RF-36 | Sin cobertura | Pendiente de verificar |

Las pruebas por archivo están en `backend/test/` y `field-app/src/`.

## 4. Criterios de aceptación propuestos

Propuesta del equipo, pendiente de aprobación de SEPSA.

| ID | Requisito | Criterio | Prueba |
|---|---|---|---|
| CA-01 | RF-01 | Con un solo rol no se puede cambiar de rol | `role-switch.test.ts` |
| CA-02 | RF-02 | El técnico solo opera sus órdenes asignadas | `policies.test.ts` |
| CA-03 | RF-05 | No hay segunda orden activa para el mismo suministro | `authority-repository.integration.test.ts` |
| CA-04 | RF-06 | Una versión obsoleta no sobrescribe la asignación | `authority-repository.integration.test.ts` |
| CA-05 | RF-17, RF-18 | Sin autorización concluyente no hay corte | `process.integration.test.ts` |
| CA-06 | RF-19 | El consumo incierto se reintenta con el mismo identificador, sin autorización nueva | `reconnection.integration.test.ts` |
| CA-07 | RF-21 | Nada se muestra como guardado si una escritura falla | `repository.integration.test.ts` |
| CA-08 | RF-22, RF-33 | Una respuesta perdida no se reenvía | `sync.integration.test.ts` |
| CA-09 | RF-32 | El corte solo se acepta con la foto verificada | `application.test.ts` |
| CA-10 | RF-26, RF-27 | La reconexión se confirma solo con habilitación de un solo uso | `reconnection.integration.test.ts` |
| CA-11 | RF-23 | La revisión humana exige motivo y versión; no confirma | `application.test.ts` |
| CA-12 | RF-30, RF-31 | Ninguna operación sale de la cola sin confirmación | `repository.integration.test.ts` |
| CA-13 | RF-24 | Conciliación solo en lectura; el técnico recibe 403 | `cut-consume.integration.test.ts` |
| CA-14 | RF-35 | Cada error dice qué quedó guardado y el siguiente paso | `error-catalog.test.ts` |
| CA-15 | RF-13 a RF-15 | Sin lectura, GPS o foto (ni excepción) no se confirma el corte | `policies.test.ts` |
| CA-16 | RF-28 | La nueva autorización solo se pide si el servidor probó que no se usó | `new-authorization.test.ts` |
| CA-17 | RF-20 | Una consulta no concluyente no permite el corte | `sync.integration.test.ts` |

## 5. Escenarios de fallo

| Escenario | Estado |
|---|---|
| Sin conexión, reinicio, reintento, duplicado, conflicto y autorización incierta | Cubiertos |
| Falla de una escritura local a mitad de una operación | Cubierto: operación, orden y cola se revierten juntas |
| Auditoría que falla en un cambio de rol | Cubierto: el cambio se revierte |
| Borrado local al cerrar sesión | Parcial: no se prueba qué datos de trabajo quedan |

# Entrega documental para SEPSA

Fuente: código de `backend/` y `field-app/`, migraciones `backend/sql/` y tabla SC08 recibida de SEPSA (imagen del 2026-10-03). Estado del repo al 2026-10-12.
Fecha: 2026-10-13
Estado: entrega, copia fechada.

Este conjunto describe el piloto provisional del sistema de cortes y reconexiones. No es la API oficial de SEPSA. Lo que corresponde a SEPSA definir está en la lista de pendientes.

La entrega tiene un cuerpo de resumen (documentos 01 a 14) y un conjunto de anexos (A01 a A14) con el detalle completo: tablas, matrices, criterios y evidencias. Cada resumen indica su anexo. El contenido del anexo no se repite en el resumen.

## Índice por punto de la carta

| Punto de la carta | Resumen | Anexo de detalle |
|---|---|---|
| 1. Requerimientos funcionales y técnicos; procesos de corte y reconexión | `01-requisitos-funcionales-tecnicos.md`, `02-procesos-corte-reconexion.md` | A01, A02 |
| 2. Arquitectura, tecnologías, modelo de datos, diccionario y código fuente | `03-arquitectura-tecnologias.md`, `04-modelo-datos.md`, `05-diccionario-datos.md`, `06-documentacion-codigo.md` | A03, A05, A06 (el 04 va completo) |
| 3. Manuales técnico, de instalación y de usuario | `07-manual-tecnico.md`, `08-manual-instalacion.md`, `09-manual-usuario.md` | A07, A08, A09 |
| 4. Plan de pruebas, criterios de aceptación y resultados | `10-plan-pruebas.md`, `11-resultados-pruebas.md` | A10, A11 |
| 5. Seguridad, perfiles de acceso y tratamiento de la información | `12-seguridad-perfiles-acceso.md`, `13-tratamiento-informacion.md` | A12, A13 |
| Transversal | `14-pendientes-sepsa.md` | A14 |

## Cómo leer

- `RF-xx`: requisito funcional. `RT-xx`: requisito técnico.
- Estado `Implementado`: existe en el código y tiene pruebas. No significa validado en campo ni aprobado por SEPSA.
- Estado `Parcial` o `Pendiente`: falta una parte, o no existe todavía. Se indica qué falta.
- Los criterios de aceptación son una propuesta. SEPSA todavía no los aprueba.

## Limitaciones de la entrega

- **Sin integración oficial con SEPSA.** El contrato del servidor es provisional y el adaptador no sustituye a la API que defina SEPSA (`03-arquitectura-tecnologias.md`, `12-seguridad-perfiles-acceso.md`).
- **Corrección de datos por el técnico.** No está en la aplicación. Se resuelve con un procedimiento manual de soporte (D-c en el plan de consolidación; no se implementa).
- **Datos de prueba.** Los deudores y órdenes son ficticios y se cargan a mano (D026). El árbol de trabajo no contiene datos de personas (D031); el historial de git sí los conserva, y su purga es una decisión de SEPSA (`14-pendientes-sepsa.md`).
- **Plan gratuito.** El servidor y la base de datos están en planes gratuitos. La primera petición tras un periodo de inactividad puede tardar cerca de un minuto (`03-arquitectura-tecnologias.md`).
- **Sesión.** Entrar exige conexión. Con la sesión vigente, de 7 días (D025), el técnico trabaja sin conexión.
- **Conciliación.** El administrador ve las operaciones por conciliar en solo lectura (D024). Resolverlas no se hace desde la interfaz.
- **Pruebas de navegador pendientes.** El doble toque se prueba en la capa de estado, sin prueba automatizada de navegador. Dos dispositivos reales no tienen prueba automatizada; el servidor rechaza un consumo con otro dispositivo (`11-resultados-pruebas.md`).
- **Pendientes de SEPSA.** Infraestructura, retención, responsable de datos, destino del SC08 y el resto de decisiones están en `14-pendientes-sepsa.md`.

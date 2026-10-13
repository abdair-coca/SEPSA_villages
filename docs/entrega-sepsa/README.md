# Entrega documental para SEPSA

Fuente: código de `backend/` y `field-app/`, migraciones `backend/sql/` y tabla SC08 recibida de SEPSA (imagen del 2026-10-03). Estado del repo al 2026-10-12.
Fecha: 2026-10-13
Estado: entrega, copia fechada.

Este conjunto describe el piloto provisional del sistema de cortes y reconexiones. No es la API oficial de SEPSA. Lo que corresponde a SEPSA definir está en la lista de pendientes.

## Índice por punto de la carta

| Punto de la carta | Documento |
|---|---|
| 1. Requerimientos funcionales y técnicos; procesos de corte y reconexión | `01-requisitos-funcionales-tecnicos.md`, `02-procesos-corte-reconexion.md` |
| 2. Arquitectura, tecnologías, modelo de datos, diccionario y código fuente | `03-arquitectura-tecnologias.md`, `04-modelo-datos.md`, `05-diccionario-datos.md`, `06-documentacion-codigo.md` |
| 3. Manuales técnico, de instalación y de usuario | `07-manual-tecnico.md`, `08-manual-instalacion.md`, `09-manual-usuario.md` |
| 4. Plan de pruebas, criterios de aceptación y resultados | `10-plan-pruebas.md`, `11-resultados-pruebas.md` |
| 5. Seguridad, perfiles de acceso y tratamiento de la información | `12-seguridad-perfiles-acceso.md`, `13-tratamiento-informacion.md` |
| Transversal | `14-pendientes-sepsa.md` |

## Cómo leer

- `RF-xx`: requisito funcional. `RT-xx`: requisito técnico.
- Estado `Implementado`: existe en el código y tiene pruebas. No significa validado en campo ni aprobado por SEPSA.
- Estado `Parcial` o `Pendiente`: falta una parte, o no existe todavía. Se indica qué falta.
- Los criterios de aceptación son una propuesta. SEPSA todavía no los aprueba.

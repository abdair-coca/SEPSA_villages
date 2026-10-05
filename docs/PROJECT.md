# SEPSA — Contexto del proyecto

## Propósito

Sistema para identificar suministros morosos, crear y asignar órdenes de corte, y registrar trabajo de campo con autorización, persistencia local y trazabilidad. El usuario inicial es un administrador y el técnico que ejecuta las órdenes asignadas.

La fuente oficial de SEPSA todavía no está integrada. El backend actual es un piloto provisional y los datos importados desde Excel no son el modelo definitivo.

## Estado actual

- El flujo principal implementado es: administrador busca morosos → crea/asigna una orden → técnico descarga sus órdenes → consulta contexto → registra visita o corte → sincroniza.
- La aplicación tiene modo simulado local y modo conectado al backend provisional.
- La creación masiva existe en el piloto, pero la validación funcional prioritaria sigue siendo una orden individual de extremo a extremo.
- Reconexión se guarda localmente y sincroniza con el backend piloto mediante habilitación provisional ligada a orden/técnico/dispositivo/operación/versión; la fuente oficial y sus reglas siguen pendientes de SEPSA.
- La integración oficial, políticas definitivas de datos y validación en campo todavía están pendientes.

## Stack actual

| Capa | Implementación |
|---|---|
| Campo y administración | React + TypeScript + Vite; PWA para campo |
| Persistencia local | IndexedDB; Service Worker para recursos de la PWA |
| Sincronización | Cola local, reintentos, idempotencia y consulta de estado |
| Backend piloto | Node.js/TypeScript, servidor HTTP y `pg` |
| Base piloto | PostgreSQL mediante migraciones SQL |
| Integración oficial | No existe todavía; se usa un adaptador provisional |

## Roles y módulos

- **Administrador:** autenticación, búsqueda de morosos, creación, asignación, consulta de órdenes y auditoría.
- **Técnico:** autenticación, descarga de órdenes propias, consulta offline, visita, lectura, GPS, evidencia, corte y sincronización.
- **Orden:** identifica suministro, contexto, técnico, versión, estado operativo y estado físico.
- **Campo:** guarda lectura final, ubicación, evidencia o excepciones justificadas.
- **Sincronización:** conserva operaciones locales hasta recibir confirmación válida o marcar revisión.

## Flujo operativo

```text
Administrador autenticado
  → busca moroso
  → crea y asigna orden
  → técnico descarga paquete propio
  → consulta cliente, suministro, medidor y deuda
  → registra visita/captura de campo
  → solicita autorización online para cortar
  → persiste resultado local
  → sincroniza cuando corresponde
  → administrador consulta auditoría
```

La falta de conexión permite trabajo local, nunca autoriza un corte físico. Un resultado remoto incierto no se repite automáticamente.

## Restricciones de contexto

- Leer `docs/RULES.md` y este documento antes de una tarea normal.
- Leer solo el feature relacionado y el código afectado; no cargar `docs/archive/` por defecto.
- Consultar `docs/ARCHITECTURE.md` para cambios de capas, persistencia, API o sincronización.
- Consultar `docs/DOMAIN.md` para entidades, estados y relaciones.
- Consultar `docs/DECISIONS.md` cuando una decisión vigente pueda verse afectada.

## Documentos activos

- [Arquitectura](ARCHITECTURE.md)
- [Dominio](DOMAIN.md)
- [Reglas](RULES.md)
- [Decisiones vigentes](DECISIONS.md)
- [Asignaciones](features/assignments.md)
- [Cortes y captura](features/cuts.md)
- [Lecturas](features/readings.md)
- [Sincronización](features/synchronization.md)

El material anterior se conserva en [archive/](archive/README.md) solo para investigación histórica o revisión de decisiones previas.

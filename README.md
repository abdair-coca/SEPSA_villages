# SEPSA · Sistema de operaciones eléctricas

Sistema offline-first para administrar órdenes de corte, asignarlas a técnicos y registrar ejecuciones de campo con trazabilidad.

## Estado actual

La aplicación principal está en `field-app/` (React, TypeScript, PWA e IndexedDB) y cuenta con backend REST/PostgreSQL para validar el recorrido administrativo y técnico:

- **Administración**: búsqueda de morosidad, contexto completo, creación y asignación individual.
- **Técnico**: órdenes asignadas, contexto offline, visita, lectura, GPS, evidencia y resultado.
- **Autorización**: validación online obligatoria antes de confirmar un corte físico.
- **Sincronización**: cola persistente, reintentos, idempotencia y auditoría.
- **Referencia visual**: `boceto-mvp/` conserva las pantallas P-01 a P-05 y su catálogo de campos.

## Cómo probar la aplicación

```bash
cd field-app
npm install
npm run dev
```

Abrir `http://localhost:5173` en el navegador. Para usar backend, configurar `VITE_PILOT_BACKEND_URL` y levantar `backend/`.

## Arquitectura objetivo

```text
Frontend:   React + TypeScript + PWA
Local:      Service Worker + IndexedDB
Sync:       Sync Engine + Sync Queue
Backend:    API REST
DB:         PostgreSQL
```

El dominio del prototipo está separado de la UI para migrar a React sin rediseñar las reglas de negocio.

## Reglas de negocio críticas

- El técnico solo opera órdenes asignadas a su identidad.
- Ningún corte se confirma sin autorización online válida y de un solo uso.
- Lectura, GPS y evidencia quedan vinculados a orden, técnico, dispositivo y fecha.
- Las excepciones de GPS y fotos requieren justificación auditable.
- Sin pérdida de operaciones: cola persistente, reintentable e idempotente.

La fuente y el contrato oficial de SEPSA permanecen pendientes de validación; los datos visibles de la interfaz son de demostración.

## Fuente de verdad

- `constitution.md` — requisitos y reglas de negocio.
- `AGENTS.md` — guía de agentes y convenciones de desarrollo.
- `docs/specs/001-Boceto-mvp/` — pipeline SDD del prototipo (proposal, spec, design, tasks).

## Roadmap

1. Referencia visual P-01 a P-05 ✅
2. Flujo vertical administrativo-técnico ✅
3. Integración con API de SEPSA ⬜
4. Validación en campo ⬜

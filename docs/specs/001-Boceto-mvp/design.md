# Diseño: Prototipo UI/UX navegable de cobranza eléctrica rural

## Enfoque técnico

Prototipo estático de una sola página en HTML/CSS/JS vanilla, sin build system ni dependencias, abriendo `index.html` directo en el navegador. La lógica de dominio vive en módulos JS puros (reglas de cobro), separada de la UI y de la capa de persistencia simulada. Estructura diseñada para migrar después a React + TypeScript + PWA + IndexedDB + API sin rediseñar el dominio.

## Decisiones de arquitectura

### Decisión: Vanilla JS sin frameworks

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| Vanilla HTML/CSS/JS | Cero setup, abre directo, migrable | ✅ Elegido |
| React + Vite | Setup/build, valor real recién en PWA | Descartado para prototipo |

**Racional**: El prompt exige prototipo navegable inmediato sin dependencias; la migración a React+TS+PWA es un cambio posterior planificado.

### Decisión: ÍndexedDB con fallback a localStorage

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| IndexedDB | Async, robusto, es el destino PWA | ✅ Primario |
| localStorage | Síncrono, simple, suficiente para prototipo | Fallback |

**Racional**: Persistencia real tras recarga con API simple; IndexedDB alinea el prototipo con el destino de la PWA.

### Decisión: Estado de conexión simulado con toggle

| Opción | Tradeoff | Decisión |
|--------|----------|----------|
| Toggle manual "Simular modo offline" | Controlable, sin red real | ✅ Elegido |
| Detección `navigator.onLine` | Depende del entorno | Complemento informativo |

**Racional**: El objetivo es demostrar comportamiento offline, no medir conectividad real.

## Flujo de datos

    UI (pantallas)
        │
        ▼
    Controlador (navegación, eventos)
        │
        ▼
    Dominio (meses completos, antiguos primero, totales)
        │
        ▼
    Store (IndexedDB/localStorage)
        ├── datos locales (domicilios, cobros)
        └── cola de cambios (pending/syncing/synced/failed)
        │
        ▼
    Sync simulada (procesa cola al volver online)

## Cambios de archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `boceto-mvp/index.html` | Crear | Estructura semántica, bottom nav, 11 pantallas, frame móvil |
| `boceto-mvp/styles.css` | Crear | Sistema visual: claro, tarjetas, botones grandes, deuda destacada, responsive |
| `boceto-mvp/app.js` | Crear | Módulos: datos semilla, dominio de cobro, store, sync, router de pantallas |

## Interfaces / contratos

```js
// Domicilio
{ id, codigo, nombre, direccion, localidad, medidor,
  mesesPendientes: [{anio, mes, montoCentavos}], deudaCentavos, estado, visitado }

// Cobro
{ id, domicilioId, mesesPagados: [], cantidadMeses, totalCentavos,
  metodo: "Efectivo", tecnico, fechaISO, comprobanteId, sync }

// Cambio pendiente (cola)
{ id, tipo: "visita"|"cobro", payload, estado: "pending"|"syncing"|"synced"|"failed", intentos }
```

Montos en unidades enteras mínimas (centavos) para evitar errores de punto flotante.

## Estrategia de prueba

| Capa | Qué probar | Cómo |
|------|-----------|------|
| Dominio | meses antiguos primero, rechazo fracciones, cálculo total, decremento de deuda | Funciones puras con casos `0/1/6/todos/más de los permitidos` |
| Store | persistencia tras recarga, encolado y estados de sync | Ciclo guardar→recargar→verificar |
| Manual | flujo completo offline → cobro → comprobante → sync | Recorrido guiado en navegador |

## Matriz de amenazas

N/A — no hay routing, shell, subprocesos, automatización VCS/PR, clasificación de ejecutables ni integración de procesos.

## Migración / despliegue

No se requiere migración. El prototipo corre como archivos estáticos.

## Preguntas abiertas

- [ ] Confirmar formato oficial de comprobante con SEPSA (pendiente de constitution).
- [ ] Confirmar significado de columnas del Excel antes de ampliar datos de simulación.
# Diseño: Prototipo de campo offline para cortes y reconexiones

## Enfoque técnico

Crear `field-app/` como SPA React 19 + TypeScript + Vite 7, mobile-first y sin CDN. `boceto-mvp/` permanece intacto. Navegación interna mediante estado, sin router externo. Datos ficticios precargados representan órdenes asignadas y escenarios de conectividad.

Separar dominio, casos de uso, persistencia y adapters. Toda autorización, habilitación y sincronización usa interfaces provisionales identificadas en UI como simulación de demostración.

## Decisiones de arquitectura

| Decisión | Alternativa | Razonamiento |
|---|---|---|
| IndexedDB nativo con transacciones multi-store | React state o localStorage | Sobrevive reinicio y permite persistencia indivisible |
| Store externo suscribible | Estado distribuido entre componentes | Mantiene UI sincronizada sin acoplarla a IndexedDB |
| Adapters mock reemplazables | Endpoints ficticios | Evita inventar contrato SEPSA |
| Estado físico separado del estado de orden | Sobrecargar estados existentes | Representa `PHYSICAL_UNKNOWN` sin repetir acciones |
| Service Worker manual sin CDN | Plugin PWA adicional | Reduce dependencias y garantiza shell offline |

## Flujo de datos

```text
UI
 ↓
Casos de uso
 ↓
Dominio + validaciones
 ↓
IndexedDB transaction ──→ Sync Queue
 ↓                              ↓
AppStore ←──── Sync Engine ← Mock adapters
```

Corte: registrar visita, solicitar autorización, completar evidencia, persistir intención, consumir autorización online, registrar resultado y cola. `unknown`, timeout o pago detectado bloquean. Interrupción posterior al consumo produce `PHYSICAL_UNKNOWN`; recuperación consulta `operation_id` y nunca repite automáticamente.

Reconexión sigue el mismo patrón, pero exige orden `EJECUTADO` y habilitación externa `enabled`. No ofrece cobros ni calcula aranceles.

## Archivos

| Archivo | Acción | Propósito |
|---|---|---|
| `field-app/package.json`, configuraciones, `index.html` | Crear | Aplicación React/Vite y pruebas |
| `field-app/public/manifest.webmanifest`, `sw.js` | Crear | Instalación y shell offline |
| `field-app/src/domain/*` | Crear | Entidades, estados y políticas |
| `field-app/src/application/*` | Crear | Operaciones y sincronización |
| `field-app/src/ports/*` | Crear | Interfaces reemplazables |
| `field-app/src/adapters/indexeddb/*` | Crear | Persistencia y cola durable |
| `field-app/src/adapters/mock/*` | Crear | Integraciones simuladas y conectividad |
| `field-app/src/app/*`, `src/ui/*`, `styles.css` | Crear | Experiencia móvil de campo |
| `field-app/src/**/*.test.ts` | Crear | Pruebas unitarias e integración |

## Contratos

```ts
type ConnectivityMode = "online" | "weak" | "offline";
type SyncStatus = "pending" | "syncing" | "synced" | "failed";
type PhysicalStatus = "NONE" | "CLAIMED" | "CONFIRMED" | "PHYSICAL_UNKNOWN";

interface AuthorizationAdapter {
  requestCut(input: AuthRequest): Promise<AuthResponse>;
  consumeCut(input: ConsumeRequest): Promise<ConsumeResponse>;
  lookup(operationId: string): Promise<RemoteResult>;
}

interface LocalRepository {
  loadAssignedPackage(): Promise<WorkPackage>;
  commitOperation(change: AtomicOperationChange): Promise<void>;
  listSyncItems(): Promise<SyncItem[]>;
}
```

## Pruebas

| Capa | Cobertura |
|---|---|
| Unit | Asignación, estados, autorización, habilitación, evidencia y transiciones |
| Integration | IndexedDB, persistencia indivisible, reinicio, cola, deduplicación y conflictos |
| E2E manual | Instalación PWA, modos de red, corte, pago detectado, reconexión y recuperación |

## Threat Matrix

| Límite | Aplicabilidad | Respuesta / RED |
|---|---|---|
| Rutas documentales, Git, commits, push y PR | N/A | Aplicación no automatiza estos límites |
| Integración de procesos externos | Applicable | `unknown` nunca significa éxito; consultar por `operation_id`; no repetir acción física. RED: timeout, consumo, respuesta perdida y duplicado |

## Migración

No requiere migración. Aplicación independiente en `field-app/`.

## Preguntas abiertas

- [ ] Contrato, autenticidad y conciliación con SEPSA.
- [ ] Duración y reintentos definitivos.
- [ ] Procedimiento humano para `PHYSICAL_UNKNOWN`.
- [ ] Catálogo de excepciones fotográficas.

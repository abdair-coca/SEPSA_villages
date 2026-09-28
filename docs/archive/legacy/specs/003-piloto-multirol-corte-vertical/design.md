# Diseño: Piloto multirol de corte vertical

## Enfoque técnico

Extender `field-app` con identidad `SIMULATED`, shells separados por rol y casos de uso compartidos. Una autoridad local IndexedDB representa el backend provisional y persiste el flujo Administrador → Técnico → Administrador sin inventar una API SEPSA. El repositorio técnico continúa aislado por identidad y dispositivo, y reutiliza autorización, sincronización, idempotencia y recuperación `PHYSICAL_UNKNOWN` del cambio 002.

## Decisiones de arquitectura

| Elección | Alternativa | Razón |
|---|---|---|
| Un `field-app` con `AdminShell` y `TechnicianShell` | Dos aplicaciones | Menor costo y entrega más rápida sin mezclar experiencias. |
| Autoridad IndexedDB `SIMULATED` | Backend nuevo o estado en memoria | Cero infraestructura, sobrevive recarga y no finge integración SEPSA. |
| DB central demo y DB técnica aislada | Una DB global | Permite intercambio multirol sin exponer paquetes entre técnicos. |
| Puertos separados de identidad, operaciones y autorización | Adapter monolítico | Conserva interfaces pequeñas y reutiliza seguridad del cambio 002. |
| `navigator.geolocation` y mapa local de referencia | CDN o tiles remotos | Evita dependencia de red; dirección y referencias siempre permanecen. |

## Flujo de datos

```text
Login SIMULATED → shell por rol
  ├─ Administrador → casos administrativos → autoridad demo IndexedDB
  └─ Técnico → descarga filtrada → repositorio técnico IndexedDB
                                      ↓
                       captura offline + cola durable
                                      ↓
                       autorización/sync SIMULATED
                                      ↓
                        autoridad demo + auditoría
```

Creación y asignación son comandos separados, idempotentes y versionados. El técnico descarga solo órdenes asignadas, captura lectura, GPS y evidencia, persiste intención, consume autorización y confirma resultado en una transacción local. La sincronización actualiza autoridad y auditoría; un resultado incierto usa `lookup(operation_id)` sin repetir acción física.

## Cambios de archivos

| Archivo | Acción | Propósito |
|---|---|---|
| `src/domain/types.ts`, `policies.ts` | Modificar | Roles, contexto, Kardex, captura, permisos y comandos. |
| `src/ports/identity.ts`, `authority.ts`, `geolocation.ts` | Crear | Interfaces provisionales separadas. |
| `src/adapters/indexeddb/authority-repository.ts` | Crear | Estado central demo, sesión, idempotencia y auditoría. |
| `src/adapters/indexeddb/database.ts`, `repository.ts` | Modificar | Migración técnica compatible y captura atómica. |
| `src/adapters/browser/geolocation.ts` | Crear | Captura GPS real del navegador. |
| `src/application/auth.ts`, `admin.ts`, `download.ts` | Crear | Identidad, búsqueda, creación, asignación y descarga. |
| `src/application/process.ts`, `sync.ts` | Modificar | Captura ampliada y publicación a autoridad. |
| `src/app/runtime.ts`, `store.ts` | Modificar | Sesión, shells, autoridad y reset demo. |
| `src/ui/FieldApp.tsx`, `styles.css` | Modificar | Login, administración y jornada técnica completa. |
| `src/**/*.test.*`, `scripts/pwa-smoke.mjs` | Modificar/crear | Cobertura del vertical y rendimiento básico. |

No se modifica `boceto-mvp`, no se agregan dependencias y no se implementan lotes ni nuevas reconexiones.

## Interfaces

```ts
type Role = "ADMIN" | "TECHNICIAN";

interface IdentityPort {
  authenticate(input: DemoCredentials): Promise<Session>;
  authorize(session: Session, action: AuthorizedAction): Promise<void>;
}

interface OperationsAuthorityPort {
  findDebtors(query: DebtorQuery): Promise<DebtorRecord[]>;
  createOrder(input: CreateOrderCommand): Promise<WorkOrder>;
  assignOrder(input: AssignOrderCommand): Promise<WorkOrder>;
  downloadAssigned(technicianId: string, deviceId: string): Promise<WorkPackageEnvelope>;
  recordSyncedOperation(operation: OperationRecord): Promise<void>;
  listAudit(orderId?: string): Promise<AuditEvent[]>;
}

interface GeolocationPort {
  read(): Promise<LocationCapture>;
}
```

## Pruebas

| Capa | Cobertura |
|---|---|
| Dominio | Roles, orden ajena, duplicados, versiones, lectura, bypass y tipos. |
| Integración | Reload, migración, aislamiento, comandos idempotentes, captura atómica y auditoría. |
| Adapters | GPS/error, pago concurrente, timeout, consumo perdido y `lookup`. |
| UI | Login rechazado, shells, morosos, asignación, contexto, captura y estados. |
| PWA | Recorrido completo, recarga, offline técnico y tiempo de arranque observable. |

## Threat Matrix

Rutas documentales y automatización Git/PR: N/A. Integración externa: aplicable a autorización y sincronización simuladas. RED obligatorios: `unknown`, timeout, pago concurrente, consumo duplicado, respuesta perdida y recuperación por `operation_id`; todos bloquean repetición física.

## Migración y rollback

Incrementar versión de DB técnica sin borrar datos 002. Crear `sepsa-demo-authority` con seed identificado `SIMULATED`. “Restablecer demo” cierra y elimina autoridad y repositorios demo conocidos antes de resembrar. Rollback retira cambio 003 y conserva comportamiento 002.

## Pendientes

- Contrato SEPSA y semántica definitiva de Kardex/deuda.
- Umbral de precisión GPS y excepción de lectura.
- Autenticación y auditoría institucionales.

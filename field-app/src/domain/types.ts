/**
 * Tipos del dominio operativo: órdenes, contexto del suministro, capturas de campo, evidencias y registros locales.
 *
 * Es la base de todo field-app: no importa nada del proyecto. Los significados de cada estado están en
 * `docs/DOMAIN.md`; los campos marcados como provisionales vienen del Excel/backend piloto y no son contrato SEPSA.
 */

/** Estado administrativo de la orden. Una orden se crea `GENERADO`; ver transiciones en `docs/DOMAIN.md`. */
export type WorkOrderStatus = "GENERADO" | "EJECUTADO" | "RECONEXIÓN" | "ANULADO";
/**
 * Estado físico del corte o reconexión, independiente del estado administrativo.
 * `CLAIMED`: intención física guardada; `PHYSICAL_UNKNOWN`: resultado incierto que exige revisión humana
 * y nunca se reintenta automáticamente.
 */
export type PhysicalStatus = "NONE" | "CLAIMED" | "CONFIRMED" | "PHYSICAL_UNKNOWN";
/** Estado de envío al backend de una operación local. `failed` no se borra: queda visible para reintento o revisión. */
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
/** Conectividad percibida. Sin conexión se puede trabajar localmente, pero nunca autorizar un corte. */
export type ConnectivityMode = "online" | "weak" | "offline";
export type Role = "ADMIN" | "TECHNICIAN";
/** Origen de los datos: simulación local o backend piloto. Ninguno es todavía la fuente oficial de SEPSA. */
export type DataSource = "SIMULATED" | "PILOT_PROVISIONAL";
/** Permisos por rol; el mapa rol → permisos está en `policies.ts`. */
export type AuthorizedAction =
  | "FIND_DEBTORS"
  | "CREATE_ORDER"
  | "ASSIGN_ORDER"
  | "VIEW_TECHNICIANS"
  | "DOWNLOAD_ASSIGNED"
  | "VIEW_AUDIT"
  | "SYNC_OPERATION"
  | "VIEW_ORDERS";

export interface DemoCredentials {
  username: string;
  password: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  username: string;
  displayName?: string;
  role: Role;
  /** Roles otorgados explícitamente por el backend autoritativo (permite cambiar de rol en la sesión). */
  roles?: Role[];
  permissions: AuthorizedAction[];
  issuedAt: string;
  authenticity: DataSource;
  /** Token HTTP provisional; el adaptador remoto lo mantiene solo en memoria. */
  sessionToken?: string;
  expiresAt?: string;
}

export interface SimulatedUser {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
  enabled: boolean;
  source: "SIMULATED";
}

export interface TechnicianRecord {
  userId: string;
  username: string;
  displayName: string;
  role: "TECHNICIAN";
  enabled: boolean;
  source: DataSource;
}

export type OrderPurpose = "CUT";

export interface KardexEntry {
  entryId: string;
  period: string;
  amountCents: number;
  billingDate?: string;
  invoiceOrigin?: string;
  daysLate?: number;
}

/**
 * Contexto completo de un suministro moroso que viaja con la orden hasta el técnico: titular, ubicación,
 * medidor, deuda y kardex. Los campos opcionales pueden faltar en la fuente; la UI los muestra como
 * "Dato no disponible" y nunca los sustituye (por ejemplo, deuda ausente no es deuda cero).
 */
export interface OperationalContext {
  debtorId: string;
  accountId: string;
  supplyId: string;
  customerName: string;
  address: string;
  references: string;
  meterId: string;
  area: string;
  areaName?: string;
  locality: string;
  route: string;
  routeName?: string;
  /** Deuda de referencia en centavos (entero), nunca en decimales de punto flotante. */
  debtCents: number;
  monthsPending: number;
  updatedAt: string;
  source: DataSource;
  kardex: KardexEntry[];
  customerCi?: string;
  contactPhone?: string;
  tariff?: string;
  supplyStatus?: string;
  enablingTitle?: string;
  routeOrder?: number;
  circuit?: string;
  cadastralLatitude?: number;
  cadastralLongitude?: number;
  meterBrand?: string;
  meterIndex?: string;
  meterMultiplier?: number;
  claims?: boolean;
  suspensionDate?: string;
  reconnectionManual?: boolean;
  reconnectionDate?: string;
  reconnectionTechnician?: string;
}

/**
 * Ubicación GPS de una captura. `UNAVAILABLE`/`BYPASSED` solo son válidos con `exceptionReason`
 * auditable; nunca se inventan coordenadas.
 */
export interface LocationCapture {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  recordedAt: string;
  status: "CAPTURED" | "UNAVAILABLE" | "BYPASSED";
  exceptionReason?: string;
}

/** Lectura final del medidor en kWh. Es obligatoria para confirmar un corte. */
export interface MeterReading {
  value?: number;
  unit: "kWh";
  meterId: string;
  recordedAt: string;
  status: "CAPTURED" | "UNAVAILABLE";
  exceptionReason?: string;
}

export type CutType = "RED" | "MEDIDOR" | "BARRAS" | "PROTECCION" | "ACOMETIDA" | "FUSIBLES";

/** Datos de campo de un corte: lectura final, GPS, tipo de corte y medidores cercanos. Se validan en `validateFieldCapture`. */
export interface FieldCapture {
  reading: MeterReading;
  location: LocationCapture;
  cutType: CutType;
  nearbyMeters: boolean;
}

export interface DebtorRecord extends OperationalContext {}

/** Acción de campo que el técnico puede registrar sobre una orden. */
export type ActionKind = "VISIT" | "CUT" | "RECONNECTION";

/** Valor de filtro que selecciona registros sin dato en ese campo ("Sin dato" en la UI). */
export const NO_DATA_FILTER_VALUE = "__NO_DATA__";

/** Filtros de búsqueda de morosos del administrador. */
export interface DebtorQuery {
  query?: string;
  area?: string;
  locality?: string;
  route?: string;
  minMonthsPending?: number;
  supplyStatus?: string;
  session?: Session;
}

/** Creación de una orden. `operationId` es único: reenviarlo devuelve la misma orden en vez de duplicarla. */
export interface CreateOrderCommand {
  operationId: string;
  debtorId: string;
  purpose: OrderPurpose;
  session?: Session;
}

/** Creación en lote: los suministros inválidos o con orden activa se omiten y se informan en `skipped`. */
export interface CreateOrdersBatchCommand {
  batchId: string;
  debtorIds: string[];
  purpose: OrderPurpose;
  session?: Session;
}

export interface BatchOrderSkip {
  debtorId: string;
  reason: "ACTIVE_ORDER_EXISTS" | "DEBTOR_NOT_FOUND" | "SUPPLY_ID_REQUIRED";
  message: string;
}

export interface CreateOrdersBatchResult {
  batchId: string;
  requestedDebtorIds: string[];
  created: WorkOrder[];
  skipped: BatchOrderSkip[];
}

/**
 * Asignación de una orden a un técnico. `expectedOrderVersion` evita pisar un cambio concurrente:
 * si la versión no coincide, la autoridad rechaza el comando (no hay last-write-wins).
 */
export interface AssignOrderCommand {
  operationId: string;
  orderId: string;
  technicianId: string;
  expectedOrderVersion: number;
  session?: Session;
}

/** Evento de auditoría inmutable; `transition` guarda el antes/después de una asignación. */
export interface AuditEvent {
  auditId: string;
  actorId: string;
  actorRole?: Role;
  action: string;
  entityId?: string;
  orderId?: string;
  operationId?: string;
  result: "accepted" | "rejected";
  reason?: string;
  transition?: {
    before: { assignedTechnicianId: string; version: number };
    after: { assignedTechnicianId: string; version: number };
  };
  deviceId?: string;
  occurredAt: string;
  source: DataSource;
}

/** Orden de trabajo tal como la ve el técnico o el administrador. */
export interface WorkOrder {
  orderId: string;
  assignedTechnicianId: string;
  status: WorkOrderStatus;
  physicalStatus: PhysicalStatus;
  /** Última versión confirmada por el backend; `version` es la revisión local de IndexedDB (compare-and-set). */
  authoritativeVersion?: number;
  version?: number;
  purpose?: OrderPurpose;
  debtorId?: string;
  accountId?: string;
  supplyId?: string;
  referenceBalanceCents?: number;
  createdBy?: string;
  createdAt?: string;
  origin?: "SIMULATED";
  context?: OperationalContext;
  cuc?: string;
  debtTopMonth?: string;
  assignedTechnicianName?: string;
}

/** Paquete de órdenes descargado para un técnico y un dispositivo concretos. */
export interface WorkPackage {
  packageId: string;
  technicianId: string;
  deviceId: string;
  version: number;
  downloadedAt: string;
  orders: WorkOrder[];
}

export type PackageValidationStatus = "SIMULATED_VALID" | "INVALID";

/** Paquete simulado con su checksum; se valida antes de guardarlo (`adapters/indexeddb/package-validation.ts`). */
export interface WorkPackageEnvelope {
  packageId: string;
  package: WorkPackage;
  authenticity: "SIMULATED";
  integrity: "SIMULATED";
  validation: PackageValidationStatus;
  checksum: string;
}

export type VisitExecution = "NONE" | "CUT" | "RECONNECTION";

/**
 * Visita registrada localmente: presencia o intento sin afirmar que hubo corte/reconexión física.
 * También se usa cuando un corte se bloquea (por ejemplo, sin autorización) para dejar constancia.
 */
export interface VisitRecord {
  operationId: string;
  kind: "VISIT";
  orderId: string;
  technicianId: string;
  deviceId: string;
  action: "VISIT";
  attemptedAction: "CUT" | "RECONNECTION";
  execution: VisitExecution;
  reason: string;
  exceptionReason?: string;
  recordedAt: string;
  evidenceRefs: string[];
  attempts: number;
  errorCode?: string;
  syncStatus: SyncStatus;
  fieldCapture?: FieldCapture;
}

/**
 * Foto de evidencia ligada a orden, operación, técnico y dispositivo. `content` vive en IndexedDB;
 * `contentHash` (SHA-256) permite al backend verificar que recibió exactamente los mismos bytes.
 */
export interface EvidenceReference {
  evidenceId: string;
  orderId: string;
  operationId: string;
  technicianId: string;
  deviceId: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  optimized: boolean;
  content?: Blob;
  contentHash?: string;
  uploadStatus?: "pending" | "uploading" | "verified" | "failed" | "review-required";
  uploadErrorCode?: string;
}

/**
 * Corte o reconexión registrado localmente. Guarda la autorización usada y su modo de consumo:
 * `immediate` (se consume al ejecutar) o `deferred` (se consume al sincronizar).
 */
export interface OperationRecord {
  operationId: string;
  kind: "CUT" | "RECONNECTION" | "VISIT";
  action: "CUT" | "RECONNECTION";
  orderId: string;
  technicianId: string;
  deviceId: string;
  status: "INTENT_PERSISTED" | "CONFIRMED" | "BLOCKED" | "PHYSICAL_UNKNOWN" | "VISIT_RECORDED";
  physicalStatus: PhysicalStatus;
  syncStatus: SyncStatus;
  recordedAt: string;
  /** Momento físico del corte/reconexión; distinto de las marcas de sincronización, que cambian. */
  effectiveAt?: string;
  /** Nombre del técnico capturado al autorizar/ejecutar (no cambia si luego se renombra el usuario). */
  technicianNameSnapshot?: string;
  /** DEMORA de SC08 en una reconexión; `Sin demora` cuando no la hubo. */
  demora?: string;
  updatedAt: string;
  attempts: number;
  authorizationId?: string;
  authorizationToken?: string;
  authorizationVersion?: number;
  authorizationConsumption?: "immediate" | "deferred";
  exceptionReason?: string;
  evidenceRefs: string[];
  errorCode?: string;
  fieldCapture?: FieldCapture;
  /** Última consulta de la autorización en el servidor que demostró que no se usó (habilita pedir otra, D022). */
  lastAuthorizationLookup?: { status: "expired" | "rejected" | "not_found"; at: string };
}

/** Cambio auditado del estado físico de una orden (antes/después y motivo). */
export interface PhysicalTransition {
  transitionId: string;
  operationId: string;
  orderId: string;
  actorId: string;
  actorRole: Role;
  technicianId: string;
  deviceId: string;
  occurredAt: string;
  reason: string;
  before: { physicalStatus: PhysicalStatus; orderVersion: number };
  after: { physicalStatus: PhysicalStatus; orderVersion: number };
}

/**
 * Genera un identificador único de operación (`prefijo-uuid`). Ese id identifica la operación en la cola,
 * en el backend y en la auditoría, y hace idempotentes los reintentos. Falla si no hay `crypto.randomUUID`
 * en vez de generar ids predecibles.
 */
export function generateOperationId(prefix = "operation"): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/i.test(prefix)) {
    throw new Error("Operation identifier prefix is invalid.");
  }
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (!randomUuid) {
    throw new Error("Secure operation identifier generation is unavailable.");
  }
  return `${prefix}-${randomUuid}`;
}

export type WorkOrderStatus = "GENERADO" | "EJECUTADO" | "RECONEXIÓN" | "ANULADO";
export type PhysicalStatus = "NONE" | "CLAIMED" | "CONFIRMED" | "PHYSICAL_UNKNOWN";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type ConnectivityMode = "online" | "weak" | "offline";
export type Role = "ADMIN" | "TECHNICIAN";
export type DataSource = "SIMULATED" | "PILOT_PROVISIONAL";
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
  permissions: AuthorizedAction[];
  issuedAt: string;
  authenticity: DataSource;
  /** Provisional HTTP session token; kept in memory by the remote adapter. */
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
  status: "PENDING" | "PAID";
  billingDate?: string;
  invoiceOrigin?: string;
  daysLate?: number;
  paidAt?: string;
}

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
  paymentPlan?: boolean;
  suspensionDate?: string;
  reconnectionManual?: boolean;
  reconnectionDate?: string;
  reconnectionTechnician?: string;
}

export interface LocationCapture {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  recordedAt: string;
  status: "CAPTURED" | "UNAVAILABLE" | "BYPASSED";
  exceptionReason?: string;
}

export interface MeterReading {
  value?: number;
  unit: "kWh";
  meterId: string;
  recordedAt: string;
  status: "CAPTURED" | "UNAVAILABLE";
  exceptionReason?: string;
}

export type CutType = "RED" | "MEDIDOR" | "BARRAS" | "PROTECCION" | "ACOMETIDA" | "FUSIBLES";

export interface FieldCapture {
  reading: MeterReading;
  location: LocationCapture;
  cutType: CutType;
  nearbyMeters: boolean;
}

export interface DebtorRecord extends OperationalContext {}

export interface DebtorQuery {
  query?: string;
  area?: string;
  locality?: string;
  route?: string;
  minMonthsPending?: number;
  supplyStatus?: string;
  session?: Session;
}

export interface CreateOrderCommand {
  operationId: string;
  debtorId: string;
  purpose: OrderPurpose;
  session?: Session;
}

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

export interface AssignOrderCommand {
  operationId: string;
  orderId: string;
  technicianId: string;
  expectedOrderVersion: number;
  session?: Session;
}

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

export interface WorkOrder {
  orderId: string;
  assignedTechnicianId: string;
  status: WorkOrderStatus;
  physicalStatus: PhysicalStatus;
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
  cancellation?: CancellationDetails;
  cuc?: string;
  debtTopMonth?: string;
  assignedTechnicianName?: string;
}

export interface CancellationDetails {
  reason: string;
  detectedAt: string;
}

export interface WorkPackage {
  packageId: string;
  technicianId: string;
  deviceId: string;
  version: number;
  downloadedAt: string;
  orders: WorkOrder[];
}

export type PackageValidationStatus = "SIMULATED_VALID" | "INVALID";

export interface WorkPackageEnvelope {
  packageId: string;
  package: WorkPackage;
  authenticity: "SIMULATED";
  integrity: "SIMULATED";
  validation: PackageValidationStatus;
  checksum: string;
}

export type VisitExecution = "NONE" | "CUT" | "RECONNECTION";

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
}

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
  updatedAt: string;
  attempts: number;
  authorizationId?: string;
  authorizationToken?: string;
  authorizationVersion?: number;
  authorizationConsumption?: "immediate" | "deferred";
  exceptionReason?: string;
  cancellation?: CancellationDetails;
  evidenceRefs: string[];
  errorCode?: string;
  fieldCapture?: FieldCapture;
}

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

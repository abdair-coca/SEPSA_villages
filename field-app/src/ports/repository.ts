/**
 * Puerto del almacenamiento local durable del técnico (IndexedDB en `adapters/indexeddb/repository.ts`).
 *
 * Garantías que debe cumplir cualquier implementación:
 * - Operación, orden y elemento de cola se escriben en la **misma transacción** (todo o nada).
 * - Las órdenes se actualizan con compare-and-set sobre `version`; un cambio concurrente produce conflicto.
 * - La cola usa leases (`claimSync`): solo el dueño vigente del lease puede cambiar el estado de un elemento.
 * - Nada se borra por un fallo de red; las operaciones inciertas quedan visibles para revisión.
 */
import type {
  OperationRecord,
  PhysicalTransition,
  EvidenceReference,
  FieldCapture,
  VisitRecord,
  WorkPackage,
  WorkOrder,
} from "../domain/types";
import type { SyncItem } from "./sync";

/** Registro local de una acción: corte/reconexión (`OperationRecord`) o visita (`VisitRecord`). */
export type StoredRecord = OperationRecord | VisitRecord;

export type CaptureDraftAction = "VISIT" | "CUT" | "RECONNECTION";

/** Un borrador de captura por técnico, dispositivo, orden y acción. */
export interface CaptureDraftKey {
  technicianId: string;
  deviceId: string;
  orderId: string;
  action: CaptureDraftAction;
}

/** Captura a medio completar; sobrevive a recargas para no perder lo que el técnico ya ingresó. */
export type CaptureDraftContent = Partial<Pick<FieldCapture, "cutType" | "nearbyMeters">> & {
  reading?: Partial<FieldCapture["reading"]>;
  location?: Partial<FieldCapture["location"]>;
  evidence?: Array<File | Blob>;
  exceptionReason?: string;
  demora?: string;
  gpsExceptionReason?: string;
};

export interface CaptureDraft extends CaptureDraftKey {
  updatedAt: string;
  content: CaptureDraftContent;
}

/** Conjunto de cambios que se escriben juntos en una sola transacción. */
export interface AtomicOperationChange {
  operation?: OperationRecord;
  visit?: VisitRecord;
  order?: WorkOrder;
  syncItem: SyncItem;
  evidence?: EvidenceReference;
}

/**
 * Resultado de reclamar una operación: `claimed` (nueva), `existing` (el mismo `operationId` ya existía:
 * replay idempotente), `order_conflict` (la orden cambió de versión) o `rejected`.
 */
export type ClaimResult =
  | { status: "claimed"; record: StoredRecord; order?: WorkOrder }
  | { status: "existing"; record: StoredRecord; order?: WorkOrder }
  | { status: "order_conflict"; currentOrder: WorkOrder }
  | { status: "rejected"; reason: string; currentOrder?: WorkOrder };

export interface LocalRepository {
  getCaptureDraft(key: CaptureDraftKey): Promise<CaptureDraft | undefined>;
  saveCaptureDraft(draft: CaptureDraft): Promise<void>;
  deleteCaptureDraft(key: CaptureDraftKey): Promise<void>;
  loadAssignedPackage(): Promise<WorkPackage>;
  getOrder(orderId: string): Promise<WorkOrder | undefined>;
  getRecord(operationId: string): Promise<StoredRecord | undefined>;
  listPhysicalTransitions?(operationId: string): Promise<PhysicalTransition[]>;
  /** Reclama atómicamente el `operationId` y el estado de la orden si la versión esperada coincide. */
  claimCut(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult>;
  /** Igual que `claimCut`, para una reconexión. */
  claimReconnection?(change: AtomicOperationChange, expectedOrderVersion: number): Promise<ClaimResult>;
  /** Reclama una visita por `operationId`; sin `order` no toca la orden ni hace compare-and-set. */
  claimVisit(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<ClaimResult>;
  /** Actualización con compare-and-set. Sin `change.order` actualiza solo el registro, nunca la orden. */
  updateOperationAndOrder(change: AtomicOperationChange, expectedOrderVersion?: number): Promise<void>;
  listSyncItems(): Promise<SyncItem[]>;
  getEvidence?(evidenceId: string): Promise<EvidenceReference | undefined>;
  updateEvidenceUploadState?(evidenceId: string, state: NonNullable<EvidenceReference["uploadStatus"]>, errorCode?: string, lease?: { owner: string; leaseToken: string; now: string }): Promise<void>;
  /**
   * Marca `cutSendPhase: send-started` justo antes del POST del corte, verificando en la misma transacción
   * que el lease sigue vigente y la evidencia está verificada. Después de esto, una interrupción solo
   * permite consultar estado (lookup), nunca reenviar.
   */
  markCutSendStarted?(operationId: string, owner: string, leaseToken: string, now: () => string): Promise<void>;
  /**
   * Toma un elemento de la cola con un lease de `leaseMilliseconds`. Evita que dos procesos (pestañas,
   * reintentos) envíen la misma operación a la vez. `busy` si otro dueño tiene un lease vigente.
   */
  claimSync(operationId: string, owner: string, now: string, leaseMilliseconds: number, options?: { allowManualReview?: boolean }): Promise<SyncClaimResult>;
  /** Pasa a `PHYSICAL_UNKNOWN` una operación cuyo resultado físico no se puede demostrar. */
  recoverPhysicalUnknown(operationId: string, now: string, lease?: { owner: string; leaseToken: string; errorCode?: string }): Promise<StoredRecord | undefined>;
  /** Cambia el estado de sincronización; exige el lease vigente (`owner` + `leaseToken`). */
  updateSyncState(
    operationId: string,
    status: SyncItem["status"],
    options: { errorCode?: string; uncertain?: boolean; attempts?: number; owner: string; leaseToken: string; now: string; manualReview?: boolean; remoteConfirmed?: boolean; authoritativeVersion?: number },
  ): Promise<void>;
  /**
   * Al arrancar, resuelve elementos `syncing` con lease vencido (la app se cerró a mitad de envío):
   * un CUT todavía en `preparing` vuelve a `pending`; el resto queda `failed` e incierto, y las acciones
   * físicas sin resultado confirmado pasan a `PHYSICAL_UNKNOWN`.
   */
  recoverInFlight?(now?: string): Promise<void>;
  recordConflict?(conflict: ConflictRecord): Promise<void>;
  listConflicts?(): Promise<ConflictRecord[]>;
  /** Guarda el conflicto (local vs remoto) y deja la operación en `failed`; el conflicto no se resuelve sobrescribiendo. */
  recordConflictAndFail(conflict: ConflictRecord, operationId: string, owner: string, leaseToken: string, now: string): Promise<void>;
}

export type SyncClaimResult =
  | { status: "claimed"; item: SyncItem }
  | { status: "busy"; item: SyncItem }
  | { status: "skipped"; item: SyncItem }
  | { status: "not_found" };

/** Conflicto conservado para revisión humana: versión local y remota, sin elegir ganador. */
export interface ConflictRecord {
  conflictId: string;
  operationId: string;
  detectedAt: string;
  local: unknown;
  remote: unknown;
  reason: string;
  technicianId?: string;
  deviceId?: string;
}

/** La orden cambió entre la lectura y la escritura (falló el compare-and-set). */
export class OrderVersionConflictError extends Error {
  readonly code = "ORDER_VERSION_CONFLICT";

  constructor() {
    super("Order changed before local CAS update.");
    this.name = "OrderVersionConflictError";
  }
}

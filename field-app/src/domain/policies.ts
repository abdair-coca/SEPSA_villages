/**
 * Reglas de negocio puras: permisos por rol, elegibilidad de visita/corte/reconexión, validación de la captura
 * de campo y de la evidencia, transiciones de estado de la orden e inmutabilidad del historial.
 *
 * Todas lanzan `DomainError` con un código estable cuando la regla no se cumple. Las usan los casos de uso
 * (`use-cases/`) y los adaptadores que actúan como autoridad simulada. No importan nada fuera de `domain/`.
 */
import { DomainError } from "./errors";
import type {
  ConnectivityMode,
  EvidenceReference,
  FieldCapture,
  OperationRecord,
  OperationalContext,
  PhysicalStatus,
  AuthorizedAction,
  Role,
  Session,
  VisitRecord,
  WorkOrder,
} from "./types";

/** Permisos que cada rol puede llegar a tener. La sesión debe además incluirlos (ver `assertCan`). */
const ROLE_PERMISSIONS: Record<Role, AuthorizedAction[]> = {
  ADMIN: ["FIND_DEBTORS", "CREATE_ORDER", "ASSIGN_ORDER", "VIEW_TECHNICIANS", "VIEW_ORDERS", "VIEW_AUDIT"],
  TECHNICIAN: ["DOWNLOAD_ASSIGNED", "SYNC_OPERATION"],
};

export function permissionsForRole(role: Role): AuthorizedAction[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function assertRecognizedRole(role: string): asserts role is Role {
  if (role !== "ADMIN" && role !== "TECHNICIAN") {
    throw new DomainError("El rol del usuario no es reconocido.", "ROLE_NOT_RECOGNIZED");
  }
}

/**
 * Exige que el rol permita la acción **y** que la sesión la tenga concedida. Las dos condiciones son
 * necesarias: una sesión con permisos de más no amplía lo que el rol permite.
 */
export function assertCan(session: Session, action: AuthorizedAction): void {
  assertRecognizedRole(session.role);
  if (!ROLE_PERMISSIONS[session.role].includes(action) || !session.permissions.includes(action)) {
    throw new DomainError("Este rol no puede realizar la acción solicitada.", "FORBIDDEN");
  }
}

/** Un técnico solo opera órdenes asignadas a él. */
export function assertAssignedOrder(order: WorkOrder, technicianId: string): void {
  if (order.assignedTechnicianId !== technicianId) {
    throw new DomainError("La orden no está asignada a este técnico.", "ORDER_NOT_ASSIGNED");
  }
}

/** La visita manual solo aplica a órdenes sin ejecución física ni revisión pendiente. */
export function assertVisitEligible(order: WorkOrder, technicianId: string): void {
  assertAssignedOrder(order, technicianId);
  if (order.status !== "GENERADO" || order.physicalStatus !== "NONE") {
    throw new DomainError("Esta orden ya tiene una ejecución de corte o una revisión.", "VISIT_NOT_ALLOWED_AFTER_CUT");
  }
}

/**
 * Elegibilidad local para intentar un corte. No autoriza el corte: la autorización online, vigente y de un
 * solo uso se pide después (`use-cases/process.ts`). `physicalStatus !== "NONE"` impide un segundo corte
 * sobre una orden ya reclamada o en revisión.
 */
export function assertCutEligible(order: WorkOrder, technicianId: string): void {
  assertAssignedOrder(order, technicianId);
  if (order.status !== "GENERADO") {
    throw new DomainError("La orden no está lista para un corte.", "ORDER_STATUS_INVALID");
  }
  if (order.physicalStatus !== "NONE") {
    throw new DomainError("La orden ya tiene un reclamo de corte físico.", "CUT_ALREADY_CLAIMED");
  }
}

/**
 * Valida la captura de un corte antes de guardarla. Reglas no negociables:
 * - Lectura final real, en kWh y del medidor esperado; no se acepta una lectura ausente o inventada.
 * - GPS capturado con coordenadas y precisión válidas, o excepción `BYPASSED` con motivo auditable.
 * - Tipo de corte del catálogo confirmado e indicación explícita de medidores cercanos.
 * Umbrales de precisión GPS: `TODO: VALIDAR CON SEPSA`.
 */
export function validateFieldCapture(capture: FieldCapture | undefined, expectedMeterId?: string): void {
  if (!capture) {
    throw new DomainError("La captura de campo es obligatoria para confirmar el corte.", "FIELD_CAPTURE_REQUIRED");
  }

  if (!capture.reading) {
    throw new DomainError("La lectura final del medidor es obligatoria.", "METER_READING_REQUIRED");
  }
  if (capture.reading.status !== "CAPTURED" || !Number.isFinite(capture.reading.value) || (capture.reading.value ?? 0) < 0) {
    throw new DomainError("La lectura final del medidor es obligatoria.", "METER_READING_REQUIRED");
  }
  if (!capture.reading.meterId.trim() || capture.reading.unit !== "kWh") {
    throw new DomainError("La lectura debe estar asociada a un medidor en kWh.", "METER_READING_INVALID");
  }
  if (expectedMeterId !== undefined && capture.reading.meterId !== expectedMeterId) {
    throw new DomainError("La lectura corresponde a un medidor diferente.", "METER_READING_MISMATCH");
  }

  if (capture.location.status === "CAPTURED") {
    if (!Number.isFinite(capture.location.latitude) || !Number.isFinite(capture.location.longitude)) {
      throw new DomainError("Las coordenadas GPS no son válidas.", "GPS_COORDINATES_INVALID");
    }
    if ((capture.location.latitude ?? 0) < -90 || (capture.location.latitude ?? 0) > 90 || (capture.location.longitude ?? 0) < -180 || (capture.location.longitude ?? 0) > 180) {
      throw new DomainError("Las coordenadas GPS están fuera de rango.", "GPS_COORDINATES_INVALID");
    }
    const accuracyMeters = capture.location.accuracyMeters;
    if (!Number.isFinite(accuracyMeters) || (accuracyMeters ?? 0) < 0) {
      throw new DomainError("La precisión GPS no es válida.", "GPS_ACCURACY_INVALID");
    }
  } else if (capture.location.status === "BYPASSED" && capture.location.exceptionReason?.trim()) {
    // La excepción de GPS es explícita y auditable; los umbrales de precisión siguen pendientes de validar con SEPSA.
  } else {
    throw new DomainError("Capture GPS o registre una excepción justificada.", "GPS_REQUIRED");
  }

  if (!["RED", "MEDIDOR", "BARRAS", "PROTECCION", "ACOMETIDA", "FUSIBLES"].includes(capture.cutType)) {
    throw new DomainError("El tipo de corte no pertenece al catálogo confirmado.", "CUT_TYPE_INVALID");
  }
  if (typeof capture.nearbyMeters !== "boolean") {
    throw new DomainError("Debe indicar si existen medidores cercanos.", "NEARBY_METERS_REQUIRED");
  }
}

/** Solo se reconecta una orden ejecutada cuyo corte físico está confirmado. */
export function assertReconnectionEligible(order: WorkOrder, technicianId: string): void {
  assertAssignedOrder(order, technicianId);
  if (order.status !== "EJECUTADO") {
    throw new DomainError("La orden no está lista para la reconexión.", "ORDER_NOT_EXECUTED");
  }
  if (order.physicalStatus !== "CONFIRMED") {
    throw new DomainError("El estado físico del corte no está confirmado.", "CUT_STATUS_INVALID");
  }
}

/**
 * Valida una foto de evidencia o, si no hay foto, exige una excepción con motivo.
 * La foto debe estar ligada a la misma orden/operación/técnico/dispositivo (`binding`), ser JPEG o PNG,
 * venir ya optimizada (≤ 5 MP) y, si trae bytes, traer también su SHA-256 para verificación en el backend.
 */
export function validateEvidence(
  evidence: EvidenceReference | undefined,
  exceptionReason?: string,
  binding?: { orderId: string; operationId: string; technicianId?: string; deviceId?: string },
): { valid: true; requiresOptimization: boolean } {
  if (!evidence) {
    if (!exceptionReason?.trim()) {
      throw new DomainError("Se requiere evidencia fotográfica o una excepción justificada.", "EVIDENCE_REQUIRED");
    }
    return { valid: true, requiresOptimization: false };
  }

  if (!Number.isFinite(evidence.width) || !Number.isFinite(evidence.height)) {
    throw new DomainError("Las dimensiones de la evidencia deben ser finitas.", "EVIDENCE_DIMENSIONS_INVALID");
  }
  if (evidence.width <= 0 || evidence.height <= 0) {
    throw new DomainError("Las dimensiones de la evidencia deben ser positivas.", "EVIDENCE_DIMENSIONS_INVALID");
  }
  if (typeof evidence.evidenceId !== "string" || !evidence.evidenceId.trim()) {
    throw new DomainError("Se requiere el identificador de la evidencia.", "EVIDENCE_ID_REQUIRED");
  }
  if (
    !binding ||
    evidence.orderId !== binding.orderId ||
    evidence.operationId !== binding.operationId ||
    (binding.technicianId !== undefined && evidence.technicianId !== binding.technicianId) ||
    (binding.deviceId !== undefined && evidence.deviceId !== binding.deviceId)
  ) {
    throw new DomainError("La evidencia está ligada a otra operación.", "EVIDENCE_BINDING_MISMATCH");
  }
  if (evidence.mimeType !== "image/jpeg" && evidence.mimeType !== "image/png") {
    throw new DomainError("La evidencia debe ser una imagen JPEG o PNG.", "EVIDENCE_FORMAT_INVALID");
  }
  if (evidence.content !== undefined && (typeof Blob === "undefined" || !(evidence.content instanceof Blob))) {
    throw new DomainError("El contenido de la evidencia debe ser un Blob.", "EVIDENCE_CONTENT_INVALID");
  }
  if (evidence.contentHash !== undefined && !/^[a-f0-9]{64}$/i.test(evidence.contentHash)) {
    throw new DomainError("El hash del contenido de la evidencia debe ser SHA-256.", "EVIDENCE_HASH_INVALID");
  }
  if (evidence.contentHash !== undefined && evidence.content === undefined) {
    throw new DomainError("Se requiere el contenido de la evidencia junto con su hash.", "EVIDENCE_CONTENT_REQUIRED");
  }
  if (evidence.content !== undefined && !evidence.contentHash) {
    throw new DomainError("Se requiere el hash del contenido guardado de la evidencia.", "EVIDENCE_HASH_REQUIRED");
  }
  if (evidence.content && evidence.content.type && evidence.content.type !== evidence.mimeType) {
    throw new DomainError("El tipo del contenido de la evidencia no coincide con sus metadatos.", "EVIDENCE_CONTENT_TYPE_INVALID");
  }
  if (evidence.optimized !== true || evidence.width * evidence.height > 5_000_000) {
    throw new DomainError("La evidencia debe estar optimizada a cinco megapíxeles o menos.", "EVIDENCE_NOT_OPTIMIZED");
  }

  return {
    valid: true,
    requiresOptimization: false,
  };
}

/**
 * Transiciones permitidas del estado administrativo: GENERADO → EJECUTADO | ANULADO, EJECUTADO → RECONEXIÓN.
 * RECONEXIÓN y ANULADO son finales.
 */
export function nextOrderState(
  current: WorkOrder["status"],
  next: WorkOrder["status"],
): WorkOrder["status"] {
  const allowed: Record<WorkOrder["status"], WorkOrder["status"][]> = {
    GENERADO: ["EJECUTADO", "ANULADO"],
    EJECUTADO: ["RECONEXIÓN"],
    RECONEXIÓN: [],
    ANULADO: [],
  };
  if (!allowed[current].includes(next)) {
    throw new DomainError(`Invalid order transition from ${current} to ${next}.`, "ORDER_TRANSITION_INVALID");
  }
  return next;
}

/**
 * La identidad de una operación ya registrada (quién, dónde, cuándo, qué) no se reescribe. Solo pueden
 * avanzar campos de sincronización; así una corrección nunca borra el hecho físico original.
 */
export function assertHistoricalOperationImmutable(
  previous: OperationRecord,
  replacement: OperationRecord,
): void {
  const immutableFields: (keyof OperationRecord)[] = [
    "operationId",
    "kind",
    "action",
    "orderId",
    "technicianId",
    "deviceId",
    "recordedAt",
    "effectiveAt",
    "technicianNameSnapshot",
    "demora",
  ];
  for (const field of immutableFields) {
    if (previous[field] !== replacement[field]) {
      throw new DomainError("La identidad de una operación histórica no puede cambiarse.", "OPERATION_IMMUTABLE");
    }
  }
}

/** Construye una visita pendiente de sincronizar; `execution` siempre es `NONE` (no afirma corte físico). */
export function createVisit(input: {
  operationId: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  reason: string;
  action?: "CUT" | "RECONNECTION";
  recordedAt: string;
  evidenceRefs?: string[];
  attempts?: number;
  errorCode?: string;
  exceptionReason?: string;
  fieldCapture?: FieldCapture;
}): VisitRecord {
  if (!input.operationId.trim()) {
    throw new DomainError("Se requiere el identificador de la operación.", "OPERATION_ID_REQUIRED");
  }
  return {
    operationId: input.operationId,
    kind: "VISIT",
    orderId: input.orderId,
    technicianId: input.technicianId,
    deviceId: input.deviceId,
    action: "VISIT",
    attemptedAction: input.action ?? "CUT",
    execution: "NONE",
    reason: input.reason,
    exceptionReason: input.exceptionReason,
    recordedAt: input.recordedAt,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
    attempts: input.attempts ?? 1,
    errorCode: input.errorCode,
    syncStatus: "pending",
    fieldCapture: input.fieldCapture,
  };
}

/** Formato de `generateOperationId`: prefijo + UUID. */
const OPERATION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertOperationId(operationId: string): void {
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new DomainError("El identificador de la operación debe contener un prefijo y un UUID.", "OPERATION_ID_INVALID");
  }
}

export function copyOrderWithPhysicalStatus(
  order: WorkOrder,
  status: WorkOrder["status"],
  physicalStatus: PhysicalStatus,
): WorkOrder {
  return { ...order, status, physicalStatus };
}

/** Copia del contexto operativo vigente; los snapshots guardados conservan su historia original. */
export function copyOperationalContext(context: OperationalContext): OperationalContext {
  return {
    debtorId: context.debtorId, accountId: context.accountId, supplyId: context.supplyId,
    customerName: context.customerName, address: context.address, references: context.references,
    meterId: context.meterId, area: context.area, areaName: context.areaName, locality: context.locality,
    route: context.route, routeName: context.routeName, debtCents: context.debtCents,
    monthsPending: context.monthsPending, updatedAt: context.updatedAt, source: context.source,
    customerCi: context.customerCi, contactPhone: context.contactPhone, tariff: context.tariff,
    supplyStatus: context.supplyStatus, enablingTitle: context.enablingTitle, routeOrder: context.routeOrder,
    circuit: context.circuit, cadastralLatitude: context.cadastralLatitude, cadastralLongitude: context.cadastralLongitude,
    meterBrand: context.meterBrand, meterIndex: context.meterIndex, meterMultiplier: context.meterMultiplier,
    claims: context.claims, suspensionDate: context.suspensionDate, reconnectionManual: context.reconnectionManual,
    reconnectionDate: context.reconnectionDate, reconnectionTechnician: context.reconnectionTechnician,
    kardex: context.kardex.map((invoice) => ({
      entryId: invoice.entryId, period: invoice.period, amountCents: invoice.amountCents,
      billingDate: invoice.billingDate, invoiceOrigin: invoice.invoiceOrigin, daysLate: invoice.daysLate,
    })),
  };
}

/** Copia profunda de la orden para uso operativo, sin datos de anulación internos. */
export function copyOrderForOperationalUse(order: WorkOrder): WorkOrder {
  const projected = structuredClone(order) as WorkOrder & { cancellation?: unknown };
  delete projected.cancellation;
  return { ...projected, context: order.context ? copyOperationalContext(order.context) : undefined };
}

/** Misma condición que `assertVisitEligible`, sin lanzar error; la UI la usa para mostrar u ocultar la acción. */
export function isManualVisitAllowed(order: WorkOrder): boolean {
  return order.status === "GENERADO" && order.physicalStatus === "NONE";
}

/** La orden tiene coordenadas catastrales numéricas y finitas para ubicarla en el mapa. */
export function hasCadastralCoordinates(context?: WorkOrder["context"]): boolean {
  return typeof context?.cadastralLatitude === "number"
    && Number.isFinite(context.cadastralLatitude)
    && typeof context?.cadastralLongitude === "number"
    && Number.isFinite(context.cadastralLongitude);
}

/** Hay algún tipo de conexión (aunque sea débil) para intentar operaciones remotas. */
export function isUsable(mode: ConnectivityMode): boolean {
  return mode !== "offline";
}

/**
 * Resultado de un corte para mostrar al técnico: confirmado solo si la orden ya figura EJECUTADO/CONFIRMED;
 * `review` si el resultado físico es incierto; `pending` si quedó guardado localmente pero sin confirmar.
 */
export function cutCompletionOutcome(durable: boolean, order?: WorkOrder): "confirmed" | "pending" | "review" | undefined {
  if (order?.status === "EJECUTADO" && order.physicalStatus === "CONFIRMED") return "confirmed";
  if (order?.physicalStatus === "PHYSICAL_UNKNOWN") return "review";
  return durable ? "pending" : undefined;
}

/** Una orden está activa mientras sigue GENERADO (todavía no ejecutada ni anulada). */
function isActiveOrder(order: WorkOrder): boolean { return order.status === "GENERADO"; }

/** Orden activa del suministro, buscada por deudor o por cuenta. Evita crear una segunda orden activa. */
export function findActiveOrderForSupply(orders: readonly WorkOrder[], debtorId: string, accountId?: string): WorkOrder | undefined {
  return orders.find((order) => isActiveOrder(order) && (order.debtorId === debtorId || (Boolean(accountId) && order.accountId === accountId)));
}

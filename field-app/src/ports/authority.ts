/**
 * Puerto de la autoridad de operaciones: la fuente que decide sobre morosos, órdenes, asignaciones,
 * paquetes de trabajo y auditoría. Lo implementan el backend piloto (`adapters/http/client.ts`) y la
 * autoridad simulada en IndexedDB (`adapters/indexeddb/authority-repository.ts`).
 *
 * La autoridad, no la UI, valida rol, asignación y versión de cada comando.
 */
import type {
  AssignOrderCommand,
  AuditEvent,
  CreateOrderCommand,
  CreateOrdersBatchCommand,
  CreateOrdersBatchResult,
  DebtorQuery,
  DebtorRecord,
  OperationRecord,
  VisitRecord,
  Session,
  TechnicianRecord,
  WorkOrder,
  WorkPackageEnvelope,
} from "../domain/types";
import type { RemoteResult } from "./authorization";

/** Pedido de autorización técnica sobre una orden a una versión concreta, para un técnico y dispositivo. */
export interface TechnicalOrderAuthorizationInput {
  operationId: string;
  action?: "CUT" | "RECONNECTION";
  orderId: string;
  technicianId: string;
  deviceId: string;
  orderVersion: number;
  session: Session;
}

/** Solo `authorized` permite continuar; `unknown` nunca se interpreta como autorización. */
export type TechnicalOrderAuthorizationResult =
  | { status: "authorized"; order: WorkOrder }
  | { status: "not_authorized" | "unknown"; errorCode: string; order?: WorkOrder };

/** Página de la búsqueda de morosos. Con `limit` y `offset` la pantalla pide solo lo que muestra. */
export interface DebtorPageQuery extends DebtorQuery {
  offset: number;
  limit: number;
}

/** `total` cuenta todos los resultados de la búsqueda, no solo los de la página. */
export interface DebtorPage {
  debtors: DebtorRecord[];
  total: number;
}

/** Campos de área, localidad, ruta y estado que alimentan los filtros de búsqueda (sin datos de deuda). */
export type DebtorFilterRecord = Pick<DebtorRecord, "area" | "areaName" | "locality" | "route" | "routeName" | "supplyStatus">;

export interface OperationsAuthorityPort {
  /** Busca suministros morosos completos (solo ADMIN). La pantalla usa `findDebtorPage`. */
  findDebtors(query: DebtorQuery): Promise<DebtorRecord[]>;
  /** Una página de la búsqueda con su total (solo ADMIN). */
  findDebtorPage(query: DebtorPageQuery): Promise<DebtorPage>;
  /** Combinaciones distintas para los filtros de búsqueda (solo ADMIN); no incluye datos de deuda. */
  listDebtorFilterRecords(session: Session): Promise<DebtorFilterRecord[]>;
  listTechnicians(session: Session): Promise<TechnicianRecord[]>;
  /** Crea una orden; idempotente por `operationId`. Rechaza si el suministro ya tiene una orden activa. */
  createOrder(input: CreateOrderCommand): Promise<WorkOrder>;
  /** Crea órdenes en lote; los suministros que no se pueden crear vuelven en `skipped` con su motivo. */
  createOrdersBatch(input: CreateOrdersBatchCommand): Promise<CreateOrdersBatchResult>;
  /** Asigna la orden a un técnico si `expectedOrderVersion` coincide; si no, rechaza (sin last-write-wins). */
  assignOrder(input: AssignOrderCommand): Promise<WorkOrder>;
  /** Descarga el paquete de órdenes asignadas al técnico para ese dispositivo. */
  downloadAssigned(technicianId: string, deviceId: string, session?: Session, knownVersion?: number): Promise<WorkPackageEnvelope>;
  /** Registra en la autoridad una operación ya sincronizada (modo simulado). */
  recordSyncedOperation(operation: OperationRecord | VisitRecord, session: Session): Promise<void>;
  authorizeTechnicalOrder(input: TechnicalOrderAuthorizationInput): Promise<TechnicalOrderAuthorizationResult>;
  /** Consulta si la autoridad tiene una operación por su `operationId` (para resolver respuestas perdidas). */
  lookupSyncedOperation(operationId: string, session: Session, technicianId: string, deviceId: string): Promise<RemoteResult>;
  listOrders(session: Session): Promise<WorkOrder[]>;
  /** Eventos de auditoría, opcionalmente filtrados por orden e incluyendo rechazos. */
  listAudit(query?: { orderId?: string; includeRejected?: boolean; session?: Session }): Promise<AuditEvent[]>;
  /** Total de eventos de auditoría visibles para el administrador, sin descargar sus páginas. */
  countAudit(session: Session): Promise<number>;
  /** Operaciones por conciliar, solo lectura (D024). Solo la tiene el backend conectado. */
  listReconciliation?(session?: Session): Promise<import("../domain/types").ReconciliationItem[]>;
}

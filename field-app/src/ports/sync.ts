/**
 * Puertos de la cola de sincronización y del transporte al backend.
 *
 * Una operación queda en la cola hasta recibir un recibo válido del servidor. Respuestas perdidas,
 * conflictos o resultados desconocidos no se reenvían: se consultan por `operationId` o quedan en revisión.
 */
import type { FieldCapture, SyncStatus, EvidenceReference } from "../domain/types";
import type { RemoteOperationReceipt } from "./authorization";

/** Elemento de la cola durable; su `operationId` es el mismo del registro local y del backend. */
export interface SyncItem {
  operationId: string;
  status: SyncStatus;
  attempts: number;
  action: "CUT" | "RECONNECTION" | "VISIT";
  orderId?: string;
  technicianId?: string;
  deviceId?: string;
  errorCode?: string;
  /** El resultado remoto no se pudo determinar; no se reintenta automáticamente. */
  uncertain?: boolean;
  updatedAt?: string;
  /** Lease de envío: dueño, vencimiento y token. Ver `LocalRepository.claimSync`. */
  leaseOwner?: string;
  leaseExpiresAt?: string;
  leaseToken?: string;
  /**
   * Prueba durable de en qué punto quedó el envío de un CUT. `preparing`: el POST no empezó y se puede
   * retomar. `send-started`: el POST pudo llegar; tras una interrupción solo se consulta estado.
   * Ausente en elementos antiguos, que tampoco se reenvían tras una interrupción.
   */
  cutSendPhase?: "preparing" | "send-started";
  /** Marcado para revisión humana: no se reenvía. */
  manualReview?: boolean;
  fieldCapture?: FieldCapture;
}

export interface SynchronizationPort {
  enqueue(item: SyncItem): Promise<void>;
  list(): Promise<SyncItem[]>;
  retry(operationId: string): Promise<void>;
}

/** Datos que se envían al backend por operación. Deben ser estables entre reintentos del mismo `operationId`. */
export interface SyncPayload {
  operationId: string;
  action: "CUT" | "RECONNECTION" | "VISIT";
  orderId: string;
  technicianId: string;
  deviceId: string;
  recordedAt: string;
  evidenceRefs: string[];
  attemptedAction?: "CUT" | "RECONNECTION";
  orderVersion?: number;
  authorizationId?: string;
  authorizationToken?: string;
  effectiveAt?: string;
  technicianNameSnapshot?: string;
  demora?: string;
  reason?: string;
  exceptionReason?: string;
  fieldCapture?: FieldCapture;
}

/** `acknowledged` con recibo confirma; `conflict` se conserva; `unknown` obliga a consultar estado. */
export type SyncTransportResponse =
  | ({ status: "acknowledged"; operationId: string } & Partial<RemoteOperationReceipt>)
  | { status: "conflict"; operationId: string; remote: unknown; reason: string }
  | { status: "unknown"; operationId: string; errorCode?: string };

/** Transporte provisional. No contiene a propósito ningún contrato de endpoint de SEPSA. */
export interface SyncTransport {
  send(payload: SyncPayload): Promise<SyncTransportResponse>;
  lookup(operationId: string): Promise<import("./authorization").RemoteResult>;
}

/** Subida de evidencia del piloto: envía los bytes guardados antes de sincronizar el CUT y espera el recibo `verified`. */
export interface EvidenceUploadPort {
  uploadEvidence(evidence: EvidenceReference): Promise<"verified">;
}

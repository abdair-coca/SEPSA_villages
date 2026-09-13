import type { FieldCapture, SyncStatus } from "../domain";

export interface SyncItem {
  operationId: string;
  status: SyncStatus;
  attempts: number;
  action: "CUT" | "RECONNECTION" | "VISIT";
  orderId?: string;
  technicianId?: string;
  deviceId?: string;
  errorCode?: string;
  uncertain?: boolean;
  updatedAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  leaseToken?: string;
  manualReview?: boolean;
  fieldCapture?: FieldCapture;
}

export interface SynchronizationPort {
  enqueue(item: SyncItem): Promise<void>;
  list(): Promise<SyncItem[]>;
  retry(operationId: string): Promise<void>;
}

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
  reason?: string;
  exceptionReason?: string;
  fieldCapture?: FieldCapture;
}

export type SyncTransportResponse =
  | { status: "acknowledged"; operationId: string }
  | { status: "conflict"; operationId: string; remote: unknown; reason: string }
  | { status: "unknown"; operationId: string; errorCode?: string };

/** Provisional seam. It deliberately contains no SEPSA endpoint contract. */
export interface SyncTransport {
  send(payload: SyncPayload): Promise<SyncTransportResponse>;
  lookup(operationId: string): Promise<import("./authorization").RemoteResult>;
}

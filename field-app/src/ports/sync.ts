import type { SyncStatus } from "../domain";

export interface SyncItem {
  operationId: string;
  status: SyncStatus;
  attempts: number;
  action: "CUT" | "RECONNECTION" | "VISIT";
  orderId?: string;
  technicianId?: string;
  deviceId?: string;
  errorCode?: string;
}

export interface SynchronizationPort {
  enqueue(item: SyncItem): Promise<void>;
  list(): Promise<SyncItem[]>;
  retry(operationId: string): Promise<void>;
}

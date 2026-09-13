import { generateOperationId, type OperationRecord, type VisitRecord } from "../domain";
import type { ConnectivityPort, LocalRepository, StoredRecord } from "../ports";
import type { SyncClaimResult } from "../ports/repository";
import type { SyncItem, SyncPayload, SyncTransport } from "../ports/sync";

export interface SyncEngineOptions {
  now?: () => string;
  owner?: string;
  leaseMilliseconds?: number;
}

export interface SyncReport {
  processed: number;
  synced: number;
  failed: number;
  skipped: number;
}

export class SyncEngine {
  private readonly now: () => string;
  private readonly owner: string;
  private readonly leaseMilliseconds: number;

  constructor(
    private readonly repository: LocalRepository,
    private readonly connectivity: ConnectivityPort,
    private readonly transport: SyncTransport,
    options: SyncEngineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.owner = options.owner ?? generateOperationId("sync-engine");
    this.leaseMilliseconds = options.leaseMilliseconds ?? 30_000;
  }

  async recoverAfterRestart(): Promise<void> {
    await this.repository.recoverInFlight?.(this.now());
  }

  async syncOnce(): Promise<SyncReport> {
    await this.recoverAfterRestart();
    if (!this.connectivity.isUsable()) return { processed: 0, synced: 0, failed: 0, skipped: 0 };
    const report: SyncReport = { processed: 0, synced: 0, failed: 0, skipped: 0 };
    const items = await this.repository.listSyncItems();
    for (const item of items) {
      if (item.status === "synced" || item.manualReview) {
        report.skipped += 1;
        continue;
      }
      const claim = await this.claim(item);
      if (claim.status !== "claimed") {
        report.skipped += 1;
        continue;
      }
      report.processed += 1;
      let result: "synced" | "failed" | "skipped";
      try {
        result = await this.syncItem(claim.item);
      } catch (error) {
        if (isLeaseFencingError(error)) {
          report.skipped += 1;
          continue;
        }
        throw error;
      }
      if (result === "synced") report.synced += 1;
      else if (result === "failed") report.failed += 1;
      else report.skipped += 1;
    }
    return report;
  }

  private async claim(item: SyncItem): Promise<SyncClaimResult> {
    return this.repository.claimSync(item.operationId, this.owner, this.now(), this.leaseMilliseconds);
  }

  private async syncItem(item: SyncItem): Promise<"synced" | "failed" | "skipped"> {
    const record = await this.repository.getRecord(item.operationId);
    if (!record) {
      await this.fail(item, "LOCAL_RECORD_MISSING", true);
      return "failed";
    }

    if (isPendingPhysicalOperation(record) && !hasDeferredAuthorization(record)) {
      await this.repository.recoverPhysicalUnknown(item.operationId, this.now(), {
        owner: this.owner,
        leaseToken: leaseToken(item),
      });
      let lookup;
      try {
        lookup = await this.transport.lookup(item.operationId);
      } catch (error) {
        await this.fail(item, errorCode(error, "LOOKUP_UNKNOWN"), true);
        return "failed";
      }
      if (lookup.operationId !== item.operationId) {
        await this.fail(item, "LOOKUP_OPERATION_ID_MISMATCH", true);
        return "failed";
      }
      if (lookup.status === "confirmed") {
        await this.finish(item, "synced", { uncertain: false, remoteConfirmed: true });
        return "synced";
      }
      await this.fail(item, lookup.status === "unknown" ? lookup.errorCode ?? "LOOKUP_UNKNOWN" : "LOOKUP_NOT_FOUND", true);
      return "failed";
    }

    if (item.uncertain) {
      let lookup;
      try {
        lookup = await this.transport.lookup(item.operationId);
      } catch (error) {
        await this.fail(item, errorCode(error, "LOOKUP_UNKNOWN"), true);
        return "failed";
      }
      if (lookup.operationId !== item.operationId) {
        await this.fail(item, "LOOKUP_OPERATION_ID_MISMATCH", true);
        return "failed";
      }
      if (lookup.status === "confirmed") {
        await this.finish(item, "synced", { uncertain: false, remoteConfirmed: true });
        return "synced";
      }
      if (lookup.status === "unknown") {
        await this.fail(item, lookup.errorCode ?? "LOOKUP_UNKNOWN", true);
        return "failed";
      }
      await this.repository.updateSyncState(item.operationId, "syncing", { owner: this.owner, leaseToken: leaseToken(item), now: this.now(), uncertain: false, errorCode: undefined });
    }

    try {
      const response = await this.transport.send(toPayload(record));
      if (response.operationId !== item.operationId) {
        await this.fail(item, "RESPONSE_OPERATION_ID_MISMATCH", true);
        return "failed";
      }
      if (response.status === "acknowledged") {
        await this.finish(item, "synced", { uncertain: false, remoteConfirmed: record.kind !== "VISIT" });
        return "synced";
      }
      if (response.status === "conflict") {
        const conflict = {
          conflictId: `conflict-${item.operationId}-${this.now()}`,
          operationId: item.operationId,
          detectedAt: this.now(),
          local: record,
          remote: response.remote,
          reason: response.reason,
          technicianId: item.technicianId,
          deviceId: item.deviceId,
        };
        await this.repository.recordConflictAndFail(conflict, item.operationId, this.owner, leaseToken(item), this.now());
        return "failed";
      }
      await this.fail(item, response.errorCode ?? "RESPONSE_UNKNOWN", true);
      return "failed";
    } catch (error) {
      await this.fail(item, errorCode(error, "RESPONSE_UNKNOWN"), true);
      return "failed";
    }
  }

  private async finish(item: SyncItem, status: SyncItem["status"], options: { uncertain?: boolean; errorCode?: string; remoteConfirmed?: boolean } = {}): Promise<void> {
    await this.repository.updateSyncState(item.operationId, status, { ...options, owner: this.owner, leaseToken: leaseToken(item), now: this.now() });
  }

  private async fail(item: SyncItem, code: string, uncertain: boolean): Promise<void> {
    await this.finish(item, "failed", { errorCode: code, uncertain });
  }
}

function toPayload(record: OperationRecord | VisitRecord): SyncPayload {
  const visit = isVisitRecord(record);
  return {
    operationId: record.operationId,
    action: visit ? "VISIT" : record.action,
    attemptedAction: visit ? record.attemptedAction : undefined,
    orderId: record.orderId,
    technicianId: record.technicianId,
    deviceId: record.deviceId,
    recordedAt: record.recordedAt,
    evidenceRefs: [...record.evidenceRefs],
    orderVersion: record.kind === "VISIT" ? undefined : record.authorizationVersion,
    authorizationId: record.kind === "VISIT" ? undefined : record.authorizationId,
    authorizationToken: record.kind === "VISIT" ? undefined : record.authorizationToken,
    reason: visit ? record.reason : undefined,
    exceptionReason: record.exceptionReason,
    fieldCapture: record.fieldCapture,
  };
}

function isVisitRecord(record: OperationRecord | VisitRecord): record is VisitRecord {
  return record.kind === "VISIT" && "reason" in record;
}

function isPendingPhysicalOperation(record: StoredRecord): record is OperationRecord {
  return record.kind !== "VISIT" && (record.status === "INTENT_PERSISTED" || record.physicalStatus === "CLAIMED");
}

function hasDeferredAuthorization(record: StoredRecord): record is OperationRecord {
  return record.kind !== "VISIT" && record.authorizationConsumption === "deferred";
}

function errorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return fallback;
}

function leaseToken(item: SyncItem): string {
  if (!item.leaseToken) throw new Error("Sync item has no fencing token.");
  return item.leaseToken;
}

function isLeaseFencingError(error: unknown): boolean {
  return error instanceof Error && /fencing token|lease belongs to another owner/i.test(error.message);
}

export { toPayload };

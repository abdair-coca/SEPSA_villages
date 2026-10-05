import { generateOperationId, type OperationRecord, type VisitRecord } from "../domain";
import type { ConnectivityPort, LocalRepository, StoredRecord } from "../ports";
import type { SyncClaimResult } from "../ports/repository";
import type { EvidenceUploadPort, SyncItem, SyncPayload, SyncTransport } from "../ports/sync";

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

export const LEGACY_LOCAL_EVIDENCE_CONFLICT_REASON = "Photo evidence remains pending until its official upload and verification contract is validated with SEPSA.";

export class SyncEngine {
  private readonly now: () => string;
  private readonly owner: string;
  private readonly leaseMilliseconds: number;

  constructor(
    private readonly repository: LocalRepository,
    private readonly connectivity: ConnectivityPort,
    private readonly transport: SyncTransport,
    options: SyncEngineOptions = {},
    private readonly evidenceUpload?: EvidenceUploadPort,
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

  private async claim(item: SyncItem, allowManualReview = false): Promise<SyncClaimResult> {
    return this.repository.claimSync(item.operationId, this.owner, this.now(), this.leaseMilliseconds, { allowManualReview });
  }

  private async syncItem(item: SyncItem): Promise<"synced" | "failed" | "skipped"> {
    const record = await this.repository.getRecord(item.operationId);
    if (!record) {
      await this.fail(item, "LOCAL_RECORD_MISSING", true);
      return "failed";
    }

    const cutLookupOnly = record.kind !== "VISIT" && record.action === "CUT" && (item.cutSendPhase !== "preparing" || record.physicalStatus === "PHYSICAL_UNKNOWN" || record.status === "PHYSICAL_UNKNOWN");
    const reconnectionLookupOnly = record.kind !== "VISIT" && record.action === "RECONNECTION" && (record.physicalStatus === "PHYSICAL_UNKNOWN" || record.status === "PHYSICAL_UNKNOWN");
    if (cutLookupOnly || reconnectionLookupOnly || (isPendingPhysicalOperation(record) && !hasDeferredAuthorization(record))) {
      if (isPendingPhysicalOperation(record)) {
        await this.repository.recoverPhysicalUnknown(item.operationId, this.now(), {
          owner: this.owner,
          leaseToken: leaseToken(item),
        });
      }
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
      if (lookup.status === "confirmed" && receiptMatches(lookup, toPayload(record))) {
        await this.finish(item, "synced", { uncertain: false, remoteConfirmed: true, authoritativeVersion: acknowledgedVersion(record), manualReview: false });
        return "synced";
      }
      if (lookup.status === "confirmed") {
        await this.fail(item, "LOOKUP_RECEIPT_MISMATCH", true);
        return "failed";
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
      if (lookup.status === "confirmed" && receiptMatches(lookup, toPayload(record))) {
        await this.finish(item, "synced", { uncertain: false, remoteConfirmed: true, authoritativeVersion: acknowledgedVersion(record), manualReview: false });
        return "synced";
      }
      if (lookup.status === "confirmed") {
        await this.fail(item, "LOOKUP_RECEIPT_MISMATCH", true);
        return "failed";
      }
      if (lookup.status === "unknown") {
        await this.fail(item, lookup.errorCode ?? "LOOKUP_UNKNOWN", true);
        return "failed";
      }
      await this.fail(item, "LOOKUP_NOT_FOUND", true);
      return "failed";
    }

    let sendStarted = false;
    try {
      if (record.kind !== "VISIT" && record.action === "CUT") {
        if (!isCutSendEligible(record)) {
          await this.fail(item, "CUT_AUTHORIZATION_NOT_CONFIRMED", false);
          return "failed";
        }
        if (!hasAuthorizationData(record)) {
          await this.fail(item, "CUT_AUTHORIZATION_MISSING", false);
          return "failed";
        }
        if (!this.repository.markCutSendStarted) {
          await this.fail(item, "CUT_SEND_FENCING_UNAVAILABLE", false);
          return "failed";
        }
      }
      if (record.kind !== "VISIT" && record.action === "RECONNECTION" && (
        record.status !== "CONFIRMED" || record.physicalStatus !== "CONFIRMED" ||
        !record.authorizationId?.trim() || !Number.isSafeInteger(record.authorizationVersion) ||
        !record.effectiveAt || !record.technicianNameSnapshot?.trim() || !record.demora?.trim() || record.demora.length > 1000
      )) {
        await this.fail(item, "RECONNECTION_DATA_INCOMPLETE", false);
        return "failed";
      }
      const evidenceError = await this.uploadOperationEvidence(item, record);
      if (evidenceError) {
        await this.fail(item, evidenceError, false);
        return "failed";
      }
      if (record.kind !== "VISIT" && record.action === "CUT") {
        await this.repository.markCutSendStarted!(item.operationId, this.owner, leaseToken(item), this.now);
        if (!item.leaseExpiresAt || item.leaseExpiresAt <= this.now()) throw new Error("Sync lease fencing token is invalid.");
      }
      sendStarted = true;
      const response = await this.transport.send(toPayload(record));
      if (response.operationId !== item.operationId) {
        await this.fail(item, "RESPONSE_OPERATION_ID_MISMATCH", true);
        return "failed";
      }
      if (response.status === "acknowledged" && receiptMatches(response, toPayload(record))) {
        await this.finish(item, "synced", { uncertain: false, remoteConfirmed: record.kind !== "VISIT", authoritativeVersion: acknowledgedVersion(record), manualReview: false });
        return "synced";
      }
      if (response.status === "acknowledged") {
        await this.fail(item, "RESPONSE_RECEIPT_MISMATCH", true);
        return "failed";
      }
      if (response.status === "conflict") {
        await this.markPhysicalUnknown(item, "REMOTE_CONFLICT");
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
      if (isLeaseFencingError(error)) throw error;
      await this.fail(item, errorCode(error, sendStarted ? "RESPONSE_UNKNOWN" : "CUT_PREPARATION_FAILED"), sendStarted);
      return "failed";
    }
  }

  private async updateEvidence(item: SyncItem, evidenceId: string, state: "uploading" | "verified" | "failed" | "review-required", code?: string): Promise<void> {
    if (!this.repository.updateEvidenceUploadState) throw new Error("EVIDENCE_UPLOAD_UNAVAILABLE");
    await this.repository.updateEvidenceUploadState(evidenceId, state, code, { owner: this.owner, leaseToken: leaseToken(item), now: this.now() });
  }

  private async uploadOperationEvidence(item: SyncItem, record: StoredRecord): Promise<string | undefined> {
    if (record.kind === "VISIT" || record.evidenceRefs.length === 0) return undefined;
    if (!this.evidenceUpload || !this.repository.getEvidence || !this.repository.updateEvidenceUploadState) return "EVIDENCE_UPLOAD_UNAVAILABLE";
    for (const evidenceId of record.evidenceRefs) {
      const evidence = await this.repository.getEvidence(evidenceId);
      if (!evidence) return "LOCAL_EVIDENCE_BYTES_MISSING";
      if (evidence.operationId !== record.operationId || evidence.orderId !== record.orderId || evidence.technicianId !== record.technicianId || evidence.deviceId !== record.deviceId || evidence.evidenceId !== evidenceId) return "LOCAL_EVIDENCE_BINDING_MISMATCH";
      if (!evidence.content || !evidence.contentHash) {
        await this.updateEvidence(item, evidenceId, "review-required", "LOCAL_EVIDENCE_BYTES_MISSING");
        return "LOCAL_EVIDENCE_BYTES_MISSING";
      }
      if (evidence.uploadStatus === "verified") continue;
      await this.updateEvidence(item, evidenceId, "uploading");
      try {
        const state = await this.evidenceUpload.uploadEvidence(evidence);
        if (state !== "verified") throw new Error("EVIDENCE_UPLOAD_NOT_VERIFIED");
        await this.updateEvidence(item, evidenceId, state);
      } catch (error) {
        if (isLeaseFencingError(error)) throw error;
        const code = errorCode(error, "EVIDENCE_UPLOAD_FAILED");
        await this.updateEvidence(item, evidenceId, "failed", code);
        return code;
      }
    }
    return undefined;
  }

  private async finish(item: SyncItem, status: SyncItem["status"], options: { uncertain?: boolean; errorCode?: string; remoteConfirmed?: boolean; manualReview?: boolean; authoritativeVersion?: number } = {}): Promise<void> {
    await this.repository.updateSyncState(item.operationId, status, { ...options, owner: this.owner, leaseToken: leaseToken(item), now: this.now() });
  }

  private async fail(item: SyncItem, code: string, uncertain: boolean): Promise<void> {
    if (uncertain) await this.markPhysicalUnknown(item, code);
    await this.finish(item, "failed", { errorCode: code, uncertain });
  }

  private async markPhysicalUnknown(item: SyncItem, errorCode: string): Promise<void> {
    const record = await this.repository.getRecord(item.operationId);
    if (!record || !isPendingPhysicalOperation(record)) return;
    await this.repository.recoverPhysicalUnknown(item.operationId, this.now(), {
      owner: this.owner,
      leaseToken: leaseToken(item),
      errorCode,
    });
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
    effectiveAt: record.kind === "VISIT" ? undefined : record.effectiveAt,
    technicianNameSnapshot: record.kind === "VISIT" ? undefined : record.technicianNameSnapshot,
    demora: record.kind === "VISIT" ? undefined : record.demora,
    evidenceRefs: [...record.evidenceRefs],
    orderVersion: record.kind === "VISIT" ? undefined : record.authorizationVersion,
    authorizationId: record.kind === "VISIT" ? undefined : record.authorizationId,
    authorizationToken: record.kind === "VISIT" || record.action === "RECONNECTION" ? undefined : record.authorizationToken,
    reason: visit ? record.reason : undefined,
    exceptionReason: record.exceptionReason,
    fieldCapture: record.fieldCapture,
  };
}

function isVisitRecord(record: OperationRecord | VisitRecord): record is VisitRecord {
  return record.kind === "VISIT" && "reason" in record;
}

function acknowledgedVersion(record: StoredRecord): number | undefined {
  if (record.kind === "VISIT") return undefined;
  const expectedVersion = record.authorizationVersion;
  return expectedVersion === undefined ? undefined : expectedVersion + 1;
}

function isPendingPhysicalOperation(record: StoredRecord): record is OperationRecord {
  return record.kind !== "VISIT" && (record.status === "INTENT_PERSISTED" || record.physicalStatus === "CLAIMED");
}

function hasDeferredAuthorization(record: StoredRecord): record is OperationRecord {
  return record.kind !== "VISIT" && record.authorizationConsumption === "deferred";
}

function hasAuthorizationData(record: OperationRecord): boolean {
  return Boolean(record.authorizationId?.trim() && record.authorizationToken?.trim() && Number.isFinite(record.authorizationVersion));
}

function isCutSendEligible(record: OperationRecord): boolean {
  return (
    (record.status === "CONFIRMED" && record.physicalStatus === "CONFIRMED" && record.authorizationConsumption !== "deferred") ||
    (record.status === "INTENT_PERSISTED" && record.physicalStatus === "CLAIMED" && record.authorizationConsumption === "deferred")
  );
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

function receiptMatches(receipt: unknown, payload: SyncPayload): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Partial<SyncPayload> & { operationId?: string };
  return value.operationId === payload.operationId &&
    value.orderId === payload.orderId &&
    value.technicianId === payload.technicianId &&
    value.deviceId === payload.deviceId &&
    value.orderVersion === payload.orderVersion &&
    value.action === payload.action &&
    value.recordedAt === payload.recordedAt &&
    value.effectiveAt === payload.effectiveAt &&
    value.technicianNameSnapshot === payload.technicianNameSnapshot &&
    value.demora === payload.demora &&
    canonicalJson(value.evidenceRefs) === canonicalJson(payload.evidenceRefs) &&
    canonicalJson(value.fieldCapture) === canonicalJson(payload.fieldCapture);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export { toPayload };

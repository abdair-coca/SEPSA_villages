import { executeCut as runCut, type CutProcessResult } from "../application/process";
import { executeOfflineVisit, type OfflineVisitResult } from "../application/visit";
import { executeReconnection as runReconnection, type ReconnectionResult } from "../application/reconnection";
import { generateOperationId, type FieldCapture, type WorkOrder } from "../domain/types";
import type { CaptureDraftKey, StoredRecord } from "../ports/repository";
import type { SyncItem } from "../ports/sync";
import { prepareEvidence } from "./evidence";
import type { ActionInput, ActionKind, ActionResult, AppState, AppStoreDependencies } from "./store";
import { actionResultForCut, actionResultForReconnection, actionResultForVisit, messageForCut, messageForReconnection } from "./store-results";

export interface ActionCoordinatorContext {
  dependencies: AppStoreDependencies;
  technicianId: string;
  technicianName: string;
  deviceId: string;
  now: () => string;
  getSnapshot: () => AppState;
  ensureReady: () => Promise<void>;
  getAssignedOrder: (orderId: string) => WorkOrder;
  runWithBusy: <T>(action: ActionKind | "SYNC", operation: () => Promise<T>) => Promise<T>;
  finishDraftIfCommitted: (orderId: string, action: ActionKind, operationId: string, input: ActionInput, options?: { recordedAction?: SyncItem["action"]; cleanupDraft?: boolean }) => Promise<void>;
  refreshAfterCommit: () => Promise<boolean>;
  syncAfterLocalAction: () => Promise<void>;
  update: (change: Partial<AppState>) => void;
}

export interface ActionCoordinator {
  registerVisit(orderId: string, input?: ActionInput): Promise<ActionResult>;
  executeCut(orderId: string, input?: ActionInput): Promise<ActionResult>;
  executeReconnection(orderId: string, input?: ActionInput): Promise<ActionResult>;
}

export function createActionCoordinator(context: ActionCoordinatorContext): ActionCoordinator {
  const { dependencies, technicianId, technicianName, deviceId, now, getSnapshot, ensureReady, getAssignedOrder, runWithBusy, finishDraftIfCommitted, refreshAfterCommit, syncAfterLocalAction, update } = context;

  return {
    async registerVisit(orderId, input = {}) {
      await ensureReady();
      const order = getAssignedOrder(orderId);
      const result = await runWithBusy("VISIT", async (): Promise<OfflineVisitResult> => {
        const operationId = generateOperationId("visit");
        const timestamp = now();
        const evidence = await prepareEvidence(input, order, operationId, technicianId, deviceId);
        const visitResult = await executeOfflineVisit({
          repository: dependencies.repository,
          order,
          operationId,
          technicianId,
          deviceId,
          attemptedAction: order.status === "EJECUTADO" ? "RECONNECTION" : "CUT",
          reason: input.reason ?? "Visita de campo sin ejecución",
          exceptionReason: input.exceptionReason,
          evidence,
          fieldCapture: input.fieldCapture,
          now: timestamp,
        });
        await finishDraftIfCommitted(orderId, "VISIT", visitResult.visit.operationId, input);
        const refreshed = await refreshAfterCommit();
        if (refreshed) update({ message: { tone: visitResult.outcome === "duplicate" ? "info" : "success", text: "Visita guardada en el dispositivo, sin afirmar ejecución física." } });
        return visitResult;
      });
      await syncAfterLocalAction();
      return actionResultForVisit(result, getSnapshot());
    },
    async executeCut(orderId, input = {}) {
      await ensureReady();
      const order = getAssignedOrder(orderId);
      const result = await runWithBusy("CUT", async (): Promise<CutProcessResult> => {
        const operationId = generateOperationId("cut");
        const timestamp = now();
        const evidence = await prepareEvidence(input, order, operationId, technicianId, deviceId);
        dependencies.prepareExternalValidation?.("CUT", order, operationId, timestamp);
        const cutResult = await runCut({
          repository: dependencies.repository,
          authorization: dependencies.authorization,
          order,
          operationId,
          technicianId,
          technicianNameSnapshot: technicianName,
          deviceId,
          now: timestamp,
          evidence,
          exceptionReason: input.exceptionReason,
          fieldCapture: input.fieldCapture,
        });
        const committed = cutResult.outcome === "executed" || cutResult.outcome === "pending_sync" || (cutResult.outcome === "duplicate" && cutResult.operation.status === "CONFIRMED");
        if (committed) await finishDraftIfCommitted(orderId, "CUT", cutResult.operation.operationId, input);
        if (cutResult.outcome === "visit_recorded") {
          await finishDraftIfCommitted(orderId, "CUT", cutResult.visit.operationId, input, { recordedAction: "VISIT", cleanupDraft: false });
        }
        const refreshed = await refreshAfterCommit();
        if (refreshed) update({ message: messageForCut(cutResult, getSnapshot().mode) });
        return cutResult;
      });
      await syncAfterLocalAction();
      return actionResultForCut(result, getSnapshot());
    },
    async executeReconnection(orderId, input = {}) {
      await ensureReady();
      const order = getAssignedOrder(orderId);
      const result = await runWithBusy("RECONNECTION", async (): Promise<ReconnectionResult> => {
        const operationId = generateOperationId("reconnection");
        const timestamp = now();
        const evidence = await prepareEvidence(input, order, operationId, technicianId, deviceId);
        dependencies.prepareExternalValidation?.("RECONNECTION", order, operationId, timestamp);
        const reconnectionResult = await runReconnection({
          repository: dependencies.repository,
          enablement: dependencies.enablement,
          order,
          operationId,
          technicianId,
          technicianNameSnapshot: technicianName,
          deviceId,
          now: timestamp,
          evidence,
          exceptionReason: input.exceptionReason,
          demora: input.demora,
        });
        const committed = reconnectionResult.outcome === "executed" || (reconnectionResult.outcome === "duplicate" && reconnectionResult.operation.status === "CONFIRMED");
        if (committed) await finishDraftIfCommitted(orderId, "RECONNECTION", reconnectionResult.operation.operationId, input);
        const refreshed = await refreshAfterCommit();
        if (refreshed) update({ message: messageForReconnection(reconnectionResult, getSnapshot().mode) });
        return reconnectionResult;
      });
      await syncAfterLocalAction();
      return actionResultForReconnection(result, getSnapshot());
    },
  };
}

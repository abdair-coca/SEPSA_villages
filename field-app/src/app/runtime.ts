import { IndexedDbLocalRepository } from "../adapters/indexeddb";
import { MockAuthorizationAdapter, MockConnectivity, MockEnablementAdapter, MockSyncTransport } from "../adapters/mock";
import type { ActionKind, AppStore, PrepareExternalValidation } from "./store";
import { createAppStore, DEMO_DEVICE_ID, DEMO_PACKAGE_ID, DEMO_TECHNICIAN_ID } from "./store";
import type { AuthorizationGrant, EnablementGrant } from "../ports";
import type { WorkOrder, WorkPackage } from "../domain";

export interface DemoValidationAdapters {
  authorization: MockAuthorizationAdapter;
  enablement: MockEnablementAdapter;
}

export function prepareDemoExternalValidation(
  action: Exclude<ActionKind, "VISIT">,
  order: WorkOrder,
  operationId: string,
  now: string,
  adapters: DemoValidationAdapters,
): void {
  const expiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString();
  if (action === "CUT") {
    const grant: AuthorizationGrant = {
      authorizationId: `grant-${operationId}`,
      token: `demo-token-${operationId}`,
      orderId: order.orderId,
      technicianId: DEMO_TECHNICIAN_ID,
      deviceId: DEMO_DEVICE_ID,
      operationId,
      version: order.version ?? 0,
      issuedAt: now,
      expiresAt,
    };
    adapters.authorization.requestResponse = { status: "authorized", grant };
  } else {
    const grant: EnablementGrant = {
      enablementId: `enablement-${operationId}`,
      token: `demo-token-${operationId}`,
      orderId: order.orderId,
      technicianId: DEMO_TECHNICIAN_ID,
      deviceId: DEMO_DEVICE_ID,
      operationId,
      version: order.version ?? 0,
      issuedAt: now,
      expiresAt,
    };
    adapters.enablement.requestResponse = { status: "enabled", grant };
  }
}

export function createDemoPackage(now = new Date().toISOString()): WorkPackage {
  return {
    packageId: DEMO_PACKAGE_ID,
    technicianId: DEMO_TECHNICIAN_ID,
    deviceId: DEMO_DEVICE_ID,
    version: 1,
    downloadedAt: now,
    orders: [
      { orderId: "ORD-24017", assignedTechnicianId: DEMO_TECHNICIAN_ID, status: "GENERADO", physicalStatus: "NONE", version: 1 },
      { orderId: "ORD-24018", assignedTechnicianId: DEMO_TECHNICIAN_ID, status: "GENERADO", physicalStatus: "NONE", version: 1 },
      { orderId: "ORD-24019", assignedTechnicianId: DEMO_TECHNICIAN_ID, status: "EJECUTADO", physicalStatus: "CONFIRMED", version: 3 },
      { orderId: "ORD-24020", assignedTechnicianId: DEMO_TECHNICIAN_ID, status: "RECONEXIÓN", physicalStatus: "CONFIRMED", version: 5 },
    ],
  };
}

export function createDemoAppStore(): AppStore {
  const connectivity = new MockConnectivity("online");
  const authorization = new MockAuthorizationAdapter({ mode: "online" });
  const enablement = new MockEnablementAdapter({ mode: "online" });
  const transport = new MockSyncTransport({ mode: "online" });
  const repository = new IndexedDbLocalRepository({ technicianId: DEMO_TECHNICIAN_ID, deviceId: DEMO_DEVICE_ID });
  const prepareExternalValidation: PrepareExternalValidation = (action, order, operationId, now) => {
    prepareDemoExternalValidation(action, order, operationId, now, { authorization, enablement });
  };
  return createAppStore({ repository, authorization, enablement, connectivity, transport, seedPackage: createDemoPackage(), prepareExternalValidation });
}

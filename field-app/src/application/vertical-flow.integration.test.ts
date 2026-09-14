import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthenticatedTechnicianStore, SimulatedAuthoritySyncTransport } from "../app/index";
import { IndexedDbAuthorityRepository, IndexedDbLocalRepository, deleteAuthorityDatabase, deleteFieldDatabase } from "../adapters/indexeddb";
import { assignOrder, createOrder, findDebtors } from "./admin";
import { downloadAssigned } from "./download";
import { login } from "./auth";
import type { FieldCapture } from "../domain";

const authorityDatabases: string[] = [];
const fieldDatabases: string[] = [];
const authorities: IndexedDbAuthorityRepository[] = [];
const repositories: IndexedDbLocalRepository[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const authority of authorities.splice(0)) await authority.close();
  for (const name of fieldDatabases.splice(0)) await deleteFieldDatabase(name);
  for (const name of authorityDatabases.splice(0)) await deleteAuthorityDatabase(name);
});

describe("complete cut order flow", () => {
  it("connects administration, technician capture, authorization, sync, and audit", async () => {
    const authorityDb = "vertical-flow-authority";
    const fieldDb = "vertical-flow-field";
    authorityDatabases.push(authorityDb);
    fieldDatabases.push(fieldDb);
    const authority = new IndexedDbAuthorityRepository({ dbName: authorityDb });
    authorities.push(authority);
    await authority.seedSimulatedData();

    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const technician = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const created = await createOrder(authority, admin, { operationId: "vertical-create-order", debtorId: debtor.debtorId, purpose: "CUT" });
    const assigned = await assignOrder(authority, admin, { operationId: "vertical-assign-order", orderId: created.orderId, technicianId: technician.userId, expectedOrderVersion: created.version ?? 1 });
    const deviceId = "device-vertical-flow";
    const packageEnvelope = await downloadAssigned(authority, technician, deviceId);
    const repository = new IndexedDbLocalRepository({ dbName: fieldDb, technicianId: technician.userId, deviceId });
    repositories.push(repository);
    const transport = new SimulatedAuthoritySyncTransport(authority, technician, repository);
    const store = createAuthenticatedTechnicianStore(technician.userId, deviceId, { repository, seedPackage: packageEnvelope.package, transport });

    await store.init();
    expect(store.getSnapshot().orders).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: assigned.orderId, assignedTechnicianId: technician.userId, status: "GENERADO" })]));
    await store.executeCut(assigned.orderId, { exceptionReason: "saltar_control_fotos: Evidencia no disponible en prueba controlada.", fieldCapture: validFieldCapture() });
    await store.sync();

    const [result] = await authority.listOrders(admin);
    expect(result).toMatchObject({ orderId: assigned.orderId, status: "EJECUTADO", physicalStatus: "CONFIRMED", cuc: expect.any(String) });
    const events = await authority.listAudit({ session: admin });
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["CREATE_ORDER", "ASSIGN_ORDER", "DOWNLOAD_ASSIGNED", "TECHNICAL_AUTHORIZATION", "SYNC_OPERATION"]));
    expect(store.getSnapshot().syncItems).toEqual(expect.arrayContaining([expect.objectContaining({ action: "CUT", status: "synced" })]));
  });
});

function validFieldCapture(): FieldCapture {
  return {
    reading: { value: 1234, unit: "kWh", meterId: "MED-1001", recordedAt: new Date().toISOString(), status: "CAPTURED" },
    location: { latitude: -19.589366, longitude: -65.259119, accuracyMeters: 8, recordedAt: new Date().toISOString(), status: "CAPTURED" },
    cutType: "PROTECCION",
    nearbyMeters: false,
  };
}

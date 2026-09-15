import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { assignOrder, createOrder, createOrdersBatch, findDebtors } from "../../application/admin";
import { downloadAssigned } from "../../application/download";
import { login } from "../../application/auth";
import type { AssignOrderCommand, CreateOrderCommand, OperationRecord, WorkOrder } from "../../domain";
import { IndexedDbAuthorityRepository, deleteAuthorityDatabase, openAuthorityDatabase, requestResult, transactionComplete } from ".";

const databases: string[] = [];
const repositories: IndexedDbAuthorityRepository[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const database of databases.splice(0)) await deleteAuthorityDatabase(database);
});

describe("SIMULATED authority vertical", () => {
  it("lists only enabled technicians with their stored identities", async () => {
    const dbName = "authority-technicians";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });

    await expect(authority.listTechnicians(admin)).resolves.toEqual([
      expect.objectContaining({ userId: "tech-camila", username: "camila.simulated", displayName: "Camila Rojas (SIMULATED)", role: "TECHNICIAN", enabled: true, source: "SIMULATED" }),
      expect.objectContaining({ userId: "tech-diego", username: "diego.simulated", displayName: "Diego Vargas (SIMULATED)", role: "TECHNICIAN", enabled: true, source: "SIMULATED" }),
    ]);
  });

  it("filters debtors by pending invoices and supply status", async () => {
    const dbName = "authority-filter-fields";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });

    const result = await findDebtors(authority, admin, { minMonthsPending: 3, supplyStatus: "A" });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ accountId: "CTA-1001", monthsPending: 3, supplyStatus: "A" });
  });

  it("matches area, locality, route, and status despite case or surrounding spaces", async () => {
    const dbName = "authority-normalized-filters";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });

    const result = await findDebtors(authority, admin, { area: " b ", locality: " 002 - mojotorillo ", route: " 002 ", supplyStatus: " a " });

    expect(result).toHaveLength(2);
    expect(result.every((debtor) => debtor.area === "B" && debtor.locality === "002 - MOJOTORILLO" && debtor.route === "002" && debtor.supplyStatus === "A")).toBe(true);
  });

  it("searches text across fields represented by filters", async () => {
    const dbName = "authority-search-all-fields";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const [base] = await findDebtors(authority, admin);
    if (!base) throw new Error("Expected seeded debtor");
    await authority.seedSimulatedData([{
      ...base,
      debtorId: "debtor-query-fields",
      accountId: "CTA-QUERY-FIELDS",
      supplyId: "SUM-QUERY-FIELDS",
      customerName: "Cliente de búsqueda",
      address: "Dirección de búsqueda",
      references: "Referencia de búsqueda",
      meterId: "MED-QUERY-FIELDS",
      area: "BETANZOS",
      locality: "LOCALIDAD-QUERY",
      route: "RUTA-QUERY",
      circuit: "CIRCUITO-QUERY",
      tariff: "TARIFA-QUERY",
      supplyStatus: "ESTADO-QUERY",
      monthsPending: 17,
      debtCents: 1717,
      kardex: [],
    }]);

    for (const query of ["BETANZOS", "LOCALIDAD-QUERY", "RUTA-QUERY", "17", "ESTADO-QUERY"]) {
      const result = await findDebtors(authority, admin, { query });
      expect(result.some((debtor) => debtor.debtorId === "debtor-query-fields")).toBe(true);
    }
  });

  it("loads deterministic E2E fake data without changing the base fixture", async () => {
    const dbName = "authority-e2e-seed";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    await authority.seedE2eData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });

    const result = await findDebtors(authority, admin, { area: "C", minMonthsPending: 2 });

    expect(result).toHaveLength(2);
    expect(result.map((debtor) => debtor.accountId)).toEqual(expect.arrayContaining(["CTA-1006", "CTA-1007"]));
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ source: "SIMULATED", supplyStatus: "A" })]));
  });

  it("creates a batch atomically, audits it, and replays it idempotently", async () => {
    const dbName = "authority-order-batch";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const debtors = await findDebtors(authority, admin);
    const command = { batchId: "create-order-batch-1", debtorIds: debtors.map((debtor) => debtor.debtorId), purpose: "CUT" as const };

    const first = await createOrdersBatch(authority, admin, command);
    const replay = await createOrdersBatch(authority, admin, command);
    const secondBatch = await createOrdersBatch(authority, admin, { ...command, batchId: "create-order-batch-2" });

    expect(first.created).toHaveLength(2);
    expect(first.skipped).toHaveLength(0);
    expect(replay).toEqual(first);
    expect(secondBatch.created).toHaveLength(0);
    expect(secondBatch.skipped).toHaveLength(2);
    expect(await authority.listOrders(admin)).toHaveLength(2);
    expect(await authority.listAudit({ session: admin })).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "CREATE_ORDER_BATCH", entityId: "create-order-batch-1", result: "accepted" }),
    ]));
  });

  it("runs admin login, search, create, assign and audit", async () => {
    const dbName = "authority-vertical";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const technician = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });

    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    expect(debtor).toMatchObject({ supplyId: "SUM-1001", source: "SIMULATED" });
    const created = await createOrder(authority, admin, { operationId: "create-order-1", debtorId: debtor.debtorId, purpose: "CUT" });
    const assigned = await assignOrder(authority, admin, { operationId: "assign-order-1", orderId: created.orderId, technicianId: technician.userId, expectedOrderVersion: created.version ?? 1 });

    expect(assigned).toMatchObject({ assignedTechnicianId: technician.userId, version: 2, status: "GENERADO" });
    expect(await authority.listAudit({ orderId: created.orderId, session: admin })).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "CREATE_ORDER", result: "accepted" }),
      expect.objectContaining({ action: "ASSIGN_ORDER", result: "accepted" }),
    ]));
  });

  it("keeps create and assign separate, idempotent, and versioned", async () => {
    const dbName = "authority-idempotency";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const technician = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });

    const command: CreateOrderCommand = { operationId: "create-idempotent", debtorId: debtor.debtorId, purpose: "CUT" };
    const first = await createOrder(authority, admin, command);
    const repeated = await createOrder(authority, admin, command);
    expect(repeated).toEqual(first);
    await expect(createOrder(authority, admin, { ...command, operationId: "create-duplicate", debtorId: debtor.debtorId })).rejects.toMatchObject({ code: "ACTIVE_ORDER_EXISTS" });

    const assignment: AssignOrderCommand = { operationId: "assign-idempotent", orderId: first.orderId, technicianId: technician.userId, expectedOrderVersion: 1 };
    const assigned = await assignOrder(authority, admin, assignment);
    expect(await assignOrder(authority, admin, assignment)).toEqual(assigned);
    await expect(assignOrder(authority, admin, { ...assignment, operationId: "assign-stale", expectedOrderVersion: 1 })).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  });

  it("deduplicates active orders by account and purpose, not debtor record", async () => {
    const dbName = "authority-account-duplicate";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    await authority.seedSimulatedData([{ ...debtor, debtorId: "debtor-same-account", supplyId: "SUM-1001-OTHER-RECORD" }]);
    await createOrder(authority, admin, { operationId: "create-account-one", debtorId: debtor.debtorId, purpose: "CUT" });

    await expect(createOrder(authority, admin, { operationId: "create-account-two", debtorId: "debtor-same-account", purpose: "CUT" })).rejects.toMatchObject({ code: "ACTIVE_ORDER_EXISTS" });
  });

  it("audits assignment transitions with before and after values", async () => {
    const dbName = "authority-reassignment-audit";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const diego = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const order = await createOrder(authority, admin, { operationId: "create-reassignment", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-camila", orderId: order.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await assignOrder(authority, admin, { operationId: "assign-diego", orderId: order.orderId, technicianId: diego.userId, expectedOrderVersion: 2 });

    const assignments = (await authority.listAudit({ orderId: order.orderId, session: admin })).filter((event) => event.action === "ASSIGN_ORDER");
    expect(assignments).toHaveLength(2);
    expect(assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ transition: { before: { assignedTechnicianId: camila.userId, version: 2 }, after: { assignedTechnicianId: diego.userId, version: 3 } } }),
    ]));
  });

  it("rejects technician elevation and isolates downloaded orders", async () => {
    const dbName = "authority-isolation";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const diego = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const order = await createOrder(authority, admin, { operationId: "create-isolation", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-isolation", orderId: order.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });

    await expect(createOrder(authority, camila, { operationId: "tech-create", debtorId: debtor.debtorId, purpose: "CUT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(downloadAssigned(authority, diego, "device-diego")).resolves.toMatchObject({ package: { orders: [] } });
    const packageEnvelope = await downloadAssigned(authority, camila, "device-camila");
    expect(packageEnvelope.package.orders).toHaveLength(1);
    expect(packageEnvelope.package.orders[0]).toMatchObject({ assignedTechnicianId: camila.userId, context: { source: "SIMULATED" } });
  });

  it("requires an assigned technician session and idempotently records sync audit", async () => {
    const dbName = "authority-sync-audit";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const diego = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const order = await createOrder(authority, admin, { operationId: "create-sync-audit", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-sync-audit", orderId: order.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await downloadAssigned(authority, camila, "device-camila");
    const operation: OperationRecord = {
      operationId: "sync-operation-1",
      kind: "CUT",
      action: "CUT",
      orderId: order.orderId,
      technicianId: camila.userId,
      deviceId: "device-camila",
      status: "CONFIRMED",
      physicalStatus: "CONFIRMED",
      syncStatus: "synced",
      recordedAt: "2026-09-13T11:00:00.000Z",
      updatedAt: "2026-09-13T11:01:00.000Z",
      attempts: 1,
      evidenceRefs: [],
    };

    await expect(authority.recordSyncedOperation(operation, diego)).rejects.toMatchObject({ code: "ORDER_NOT_ASSIGNED" });
    await expect(authority.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: operation.deviceId, operationId: operation.operationId, orderVersion: 2, session: camila })).resolves.toMatchObject({ status: "authorized" });
    await expect(authority.recordSyncedOperation(operation, camila)).resolves.toBeUndefined();
    await expect(authority.recordSyncedOperation(operation, camila)).resolves.toBeUndefined();
    await expect(authority.recordSyncedOperation({ ...operation, deviceId: "device-other" }, camila)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const syncEvents = (await authority.listAudit({ orderId: order.orderId, includeRejected: false, session: admin })).filter((event) => event.action === "SYNC_OPERATION");
    expect(syncEvents).toHaveLength(1);
    expect(syncEvents[0]).toMatchObject({ operationId: operation.operationId, actorId: camila.userId, source: "SIMULATED" });
    expect(await authority.listAudit({ includeRejected: true, session: admin })).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "SYNC_OPERATION", actorId: diego.userId, result: "rejected" }),
    ]));
  });

  it("authorizes technical actions only for current assignment, device, and order version", async () => {
    const dbName = "authority-technical-authorization";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const diego = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const order = await createOrder(authority, admin, { operationId: "create-technical-authorization", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-technical-authorization", orderId: order.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await downloadAssigned(authority, camila, "device-technical");

    await expect(authority.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: "device-technical", operationId: "technical-operation-1", orderVersion: 2, session: camila })).resolves.toMatchObject({ status: "authorized", order: { version: 2, assignedTechnicianId: camila.userId } });
    await expect(authority.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: "device-technical", operationId: "technical-operation-2", orderVersion: 1, session: camila })).resolves.toMatchObject({ status: "not_authorized", errorCode: "ORDER_VERSION_CONFLICT" });
    await expect(authority.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: "other-device", operationId: "technical-operation-3", orderVersion: 2, session: camila })).resolves.toMatchObject({ status: "not_authorized", errorCode: "DEVICE_OWNERSHIP_CONFLICT" });

    await assignOrder(authority, admin, { operationId: "reassign-technical-authorization", orderId: order.orderId, technicianId: diego.userId, expectedOrderVersion: 2 });
    await expect(authority.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: "device-technical", operationId: "technical-operation-4", orderVersion: 2, session: camila })).resolves.toMatchObject({ status: "not_authorized", errorCode: "ORDER_NOT_ASSIGNED" });
  });

  it("rejects forged physical sync, consumes authorization once, and rejects stale order versions", async () => {
    const dbName = "authority-physical-reservation";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const diego = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const order = await createOrder(authority, admin, { operationId: "create-physical-reservation", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-physical-reservation", orderId: order.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await downloadAssigned(authority, camila, "device-physical-reservation");

    const forged = operationFor(order.orderId, camila.userId, "device-physical-reservation", "forged-confirmed-operation");
    await expect(authority.recordSyncedOperation(forged, camila)).rejects.toMatchObject({ code: "AUTHORIZATION_REQUIRED" });
    await expect(authority.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: forged.deviceId, operationId: forged.operationId, orderVersion: 2, session: camila })).resolves.toMatchObject({ status: "authorized" });
    await expect(authority.recordSyncedOperation(forged, camila)).resolves.toBeUndefined();
    await expect(authority.recordSyncedOperation(forged, camila)).resolves.toBeUndefined();
    await expect(authority.recordSyncedOperation(operationFor(order.orderId, camila.userId, forged.deviceId, "second-confirmed-operation"), camila)).rejects.toMatchObject({ code: "AUTHORIZATION_REQUIRED" });

    const [secondDebtor] = await findDebtors(authority, admin, { query: "SUM-1002" });
    const staleOrder = await createOrder(authority, admin, { operationId: "create-stale-reservation", debtorId: secondDebtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-stale-reservation", orderId: staleOrder.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await authority.authorizeTechnicalOrder({ orderId: staleOrder.orderId, technicianId: camila.userId, deviceId: forged.deviceId, operationId: "stale-confirmed-operation", orderVersion: 2, session: camila });
    await assignOrder(authority, admin, { operationId: "reassign-stale-reservation-away", orderId: staleOrder.orderId, technicianId: diego.userId, expectedOrderVersion: 2 });
    await assignOrder(authority, admin, { operationId: "reassign-stale-reservation-back", orderId: staleOrder.orderId, technicianId: camila.userId, expectedOrderVersion: 3 });
    await expect(authority.recordSyncedOperation(operationFor(staleOrder.orderId, camila.userId, forged.deviceId, "stale-confirmed-operation"), camila)).rejects.toMatchObject({ code: "ORDER_VERSION_CONFLICT" });
  });

  it("claims a device for its first technician and rejects another owner without accepted sync audit", async () => {
    const dbName = "authority-device-owner";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const diego = await login(authority, { username: "diego.simulated", password: "SIMULATED-diego-003" });
    const [debtor] = await findDebtors(authority, admin, { query: "SUM-1001" });
    const firstOrder = await createOrder(authority, admin, { operationId: "create-device-owner-1", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-device-owner-1", orderId: firstOrder.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await downloadAssigned(authority, camila, "device-shared");

    const [secondDebtor] = await findDebtors(authority, admin, { query: "SUM-1002" });
    const secondOrder = await createOrder(authority, admin, { operationId: "create-device-owner-2", debtorId: secondDebtor.debtorId, purpose: "CUT" });
    await assignOrder(authority, admin, { operationId: "assign-device-owner-2", orderId: secondOrder.orderId, technicianId: diego.userId, expectedOrderVersion: 1 });
    await expect(downloadAssigned(authority, diego, "device-shared")).rejects.toMatchObject({ code: "DEVICE_OWNERSHIP_CONFLICT" });

    const operation: OperationRecord = {
      operationId: "sync-device-owner-2",
      kind: "CUT",
      action: "CUT",
      orderId: secondOrder.orderId,
      technicianId: diego.userId,
      deviceId: "device-shared",
      status: "CONFIRMED",
      physicalStatus: "CONFIRMED",
      syncStatus: "synced",
      recordedAt: "2026-09-13T11:00:00.000Z",
      updatedAt: "2026-09-13T11:01:00.000Z",
      attempts: 1,
      evidenceRefs: [],
    };
    await expect(authority.recordSyncedOperation(operation, diego)).rejects.toMatchObject({ code: "DEVICE_OWNERSHIP_CONFLICT" });
    const database = await openAuthorityDatabase(dbName);
    const bindingTransaction = database.transaction("device-bindings", "readonly");
    const bindings = await requestResult(bindingTransaction.objectStore("device-bindings").getAll());
    await transactionComplete(bindingTransaction);
    database.close();
    expect(bindings).toEqual([expect.objectContaining({ deviceId: "device-shared", technicianId: camila.userId })]);
    expect((await authority.listAudit({ includeRejected: false, session: admin })).filter((event) => event.action === "SYNC_OPERATION")).toHaveLength(0);
  });

  it("migrates v2 bindings before recreating device ownership and blocks conflicting owners", async () => {
    const dbName = "authority-v2-binding-migration";
    databases.push(dbName);
    await createAuthorityV2Database(dbName, [
      { bindingId: "tech-camila:device-legacy", technicianId: "tech-camila", deviceId: "device-legacy", packageId: "package-legacy", boundAt: "2026-09-12T10:00:00.000Z" },
      { bindingId: "tech-camila:device-conflict", technicianId: "tech-camila", deviceId: "device-conflict", packageId: "package-conflict-a", boundAt: "2026-09-12T10:00:00.000Z" },
      { bindingId: "tech-diego:device-conflict", technicianId: "tech-diego", deviceId: "device-conflict", packageId: "package-conflict-b", boundAt: "2026-09-12T10:01:00.000Z" },
    ]);

    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    await authority.close();
    const reopened = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(reopened);
    const database = await openAuthorityDatabase(dbName);
    const transaction = database.transaction("device-bindings", "readonly");
    const store = transaction.objectStore("device-bindings");
    const bindings = await requestResult(store.getAll()) as Array<Record<string, unknown>>;
    await transactionComplete(transaction);
    database.close();

    expect(store.keyPath).toBe("deviceId");
    expect(bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ deviceId: "device-legacy", technicianId: "tech-camila", ownershipStatus: "ACTIVE" }),
      expect.objectContaining({ deviceId: "device-conflict", technicianId: "", ownershipStatus: "CONFLICT", owners: ["tech-camila", "tech-diego"], legacyBindings: expect.arrayContaining([expect.objectContaining({ bindingId: "tech-camila:device-conflict" }), expect.objectContaining({ bindingId: "tech-diego:device-conflict" })]) }),
    ]));

    const admin = await login(reopened, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const camila = await login(reopened, { username: "camila.simulated", password: "SIMULATED-camila-003" });
    const [debtor] = await findDebtors(reopened, admin, { query: "SUM-1001" });
    const order = await createOrder(reopened, admin, { operationId: "create-migration-unique", debtorId: debtor.debtorId, purpose: "CUT" });
    await assignOrder(reopened, admin, { operationId: "assign-migration-unique", orderId: order.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await reopened.authorizeTechnicalOrder({ orderId: order.orderId, technicianId: camila.userId, deviceId: "device-legacy", operationId: "sync-migration-unique", orderVersion: 2, session: camila });
    await expect(reopened.recordSyncedOperation(operationFor(order.orderId, camila.userId, "device-legacy", "sync-migration-unique"), camila)).resolves.toBeUndefined();

    const [conflictDebtor] = await findDebtors(reopened, admin, { query: "SUM-1002" });
    const conflictOrder = await createOrder(reopened, admin, { operationId: "create-migration-conflict", debtorId: conflictDebtor.debtorId, purpose: "CUT" });
    await assignOrder(reopened, admin, { operationId: "assign-migration-conflict", orderId: conflictOrder.orderId, technicianId: camila.userId, expectedOrderVersion: 1 });
    await expect(reopened.recordSyncedOperation(operationFor(conflictOrder.orderId, camila.userId, "device-conflict", "sync-migration-conflict"), camila)).rejects.toMatchObject({ code: "DEVICE_OWNERSHIP_CONFLICT" });
    expect((await reopened.listAudit({ includeRejected: false, session: admin })).filter((event) => event.operationId === "sync-migration-conflict")).toHaveLength(0);
  });
});

function operationFor(orderId: string, technicianId: string, deviceId: string, operationId: string): OperationRecord {
  return {
    operationId,
    kind: "CUT",
    action: "CUT",
    orderId,
    technicianId,
    deviceId,
    status: "CONFIRMED",
    physicalStatus: "CONFIRMED",
    syncStatus: "synced",
    recordedAt: "2026-09-13T11:00:00.000Z",
    updatedAt: "2026-09-13T11:01:00.000Z",
    attempts: 1,
    evidenceRefs: [],
  };
}

function createAuthorityV2Database(name: string, bindings: Array<{ bindingId: string; technicianId: string; deviceId: string; packageId: string; boundAt: string }>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      const stores: Array<[string, string]> = [["users", "userId"], ["sessions", "sessionId"], ["debtors", "debtorId"], ["orders", "orderId"], ["operations", "operationId"], ["audit", "auditId"], ["device-bindings", "bindingId"]];
      for (const [store, keyPath] of stores) database.createObjectStore(store, { keyPath });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("device-bindings", "readwrite");
      for (const binding of bindings) transaction.objectStore("device-bindings").put(binding);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Unable to seed v2 authority database."));
    };
  });
}

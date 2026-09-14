import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { IndexedDbAuthorityRepository, deleteAuthorityDatabase, openAuthorityDatabase, requestResult, transactionComplete } from "../adapters/indexeddb";
import { login } from "./auth";

const databases: string[] = [];
const repositories: IndexedDbAuthorityRepository[] = [];

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const database of databases.splice(0)) await deleteAuthorityDatabase(database);
});

describe("simulated authentication", () => {
  it("authenticates admin and technician with only role permissions", async () => {
    const dbName = "authority-auth";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();

    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const technician = await login(authority, { username: "camila.simulated", password: "SIMULATED-camila-003" });

    expect(admin).toMatchObject({ role: "ADMIN", authenticity: "SIMULATED" });
    expect(admin.permissions).toContain("CREATE_ORDER");
    expect(technician).toMatchObject({ role: "TECHNICIAN", authenticity: "SIMULATED" });
    expect(technician.permissions).not.toContain("CREATE_ORDER");
    expect(JSON.stringify(admin)).not.toContain("password");

    const database = await openAuthorityDatabase(dbName);
    const transaction = database.transaction("users", "readonly");
    const users = await requestResult(transaction.objectStore("users").getAll()) as Array<Record<string, unknown>>;
    await transactionComplete(transaction);
    database.close();
    expect(users.every((user) => !Object.prototype.hasOwnProperty.call(user, "password"))).toBe(true);
    expect(users.every((user) => typeof user.credentialHash === "string")).toBe(true);
  });

  it("assigns seven-day expiry and rejects an expired stored session", async () => {
    const dbName = "authority-auth-expiry";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });

    expect(admin.expiresAt).toBeDefined();
    expect(Date.parse(admin.expiresAt as string) - Date.parse(admin.issuedAt)).toBe(7 * 24 * 60 * 60 * 1000);
    const database = await openAuthorityDatabase(dbName);
    const transaction = database.transaction("sessions", "readwrite");
    const stored = await requestResult(transaction.objectStore("sessions").get(admin.sessionId)) as Record<string, unknown>;
    stored.expiresAt = new Date(Date.now() - 1).toISOString();
    transaction.objectStore("sessions").put(stored);
    await transactionComplete(transaction);
    database.close();

    await expect(authority.authorize(admin, "VIEW_ORDERS")).rejects.toMatchObject({ code: "AUTHENTICATION_EXPIRED" });
  });

  it("rejects invalid credentials and records rejected access without operational data", async () => {
    const dbName = "authority-auth-rejected";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    await authority.seedSimulatedData();

    await expect(login(authority, { username: "admin.simulated", password: "wrong" })).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
    const admin = await login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" });
    const audit = await authority.listAudit({ includeRejected: true, session: admin });
    expect(audit).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "LOGIN", result: "rejected", actorId: "anonymous" }),
    ]));
  });

  it("migrates legacy demo credentials with an asynchronous Web Crypto hash before opening writes", async () => {
    const dbName = "authority-credential-migration";
    databases.push(dbName);
    const authority = new IndexedDbAuthorityRepository({ dbName });
    repositories.push(authority);
    const database = await openAuthorityDatabase(dbName);
    const transaction = database.transaction("users", "readwrite");
    transaction.objectStore("users").put({ userId: "admin-simulated", username: "admin.simulated", password: "SIMULATED-admin-003", displayName: "Administración SIMULATED", role: "ADMIN", enabled: true, source: "SIMULATED" });
    await transactionComplete(transaction);
    database.close();

    await expect(login(authority, { username: "admin.simulated", password: "SIMULATED-admin-003" })).resolves.toMatchObject({ role: "ADMIN" });
    const migrated = await openAuthorityDatabase(dbName);
    const migratedTransaction = migrated.transaction("users", "readonly");
    const users = await requestResult(migratedTransaction.objectStore("users").getAll()) as Array<Record<string, unknown>>;
    await transactionComplete(migratedTransaction);
    migrated.close();
    expect(users[0]).toMatchObject({ credentialHash: expect.any(String) });
    expect(users[0]).not.toHaveProperty("password");
  });
});

import { describe, expect, it } from "vitest";
import type { Session } from "../domain";
import { clearStoredSession, persistRememberedUsername, persistSession, readRememberedUsername, readStoredSession } from "./session-persistence";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const session: Session = {
  sessionId: "session-1",
  userId: "user-1",
  username: "admin.simulated",
  displayName: "Administración",
  role: "ADMIN",
  permissions: ["VIEW_ORDERS"],
  issuedAt: "2026-09-13T00:00:00.000Z",
  expiresAt: "2027-09-20T00:00:00.000Z",
  authenticity: "SIMULATED",
  sessionToken: "must-not-persist",
};

describe("session persistence", () => {
  it("persists session identity without session token", () => {
    const storage = createStorage();
    persistSession(session, storage);

    const { sessionToken: _sessionToken, ...safeSession } = session;
    expect(readStoredSession(storage)).toEqual(safeSession);
    expect(storage.getItem("sepsa.authenticated-session")).not.toContain("must-not-persist");
  });

  it("removes legacy persisted session tokens when restoring", () => {
    const storage = createStorage();
    storage.setItem("sepsa.authenticated-session", JSON.stringify(session));

    expect(readStoredSession(storage)).toBeDefined();
    expect(storage.getItem("sepsa.authenticated-session")).not.toContain("must-not-persist");
  });

  it("remembers username but never handles a password", () => {
    const storage = createStorage();
    persistRememberedUsername(" admin.simulated ", true, storage);
    expect(readRememberedUsername(storage)).toBe("admin.simulated");
    persistRememberedUsername("admin.simulated", false, storage);
    expect(readRememberedUsername(storage)).toBe("");
  });

  it("clears session while leaving remembered username intact", () => {
    const storage = createStorage();
    persistSession(session, storage);
    persistRememberedUsername(session.username, true, storage);
    clearStoredSession(storage);

    expect(readStoredSession(storage)).toBeUndefined();
    expect(readRememberedUsername(storage)).toBe(session.username);
  });
});

import type { Session } from "../domain";

export const SESSION_STORAGE_KEY = "sepsa.authenticated-session";
export const REMEMBERED_USERNAME_STORAGE_KEY = "sepsa.remembered-username";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readStoredSession(storage: StorageLike | undefined = getStorage()): Session | undefined {
  if (!storage) return undefined;
  try {
    const value = storage.getItem(SESSION_STORAGE_KEY);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as Partial<Session> & { sessionToken?: unknown };
    if (!parsed.sessionId || !parsed.userId || !parsed.username || !parsed.role || !parsed.expiresAt) return undefined;
    if (!isValidFutureDate(parsed.expiresAt)) {
      storage.removeItem(SESSION_STORAGE_KEY);
      return undefined;
    }
    const { sessionToken: _sessionToken, ...safeSession } = parsed;
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safeSession));
    return safeSession as Session;
  } catch {
    return undefined;
  }
}

export function persistSession(session: Session, storage: StorageLike | undefined = getStorage()): void {
  if (!storage) return;
  try {
    const { sessionToken: _sessionToken, ...safeSession } = session;
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safeSession));
  } catch {
    // Session persistence is best effort; authentication must still work.
  }
}

export function clearStoredSession(storage: StorageLike | undefined = getStorage()): void {
  try { storage?.removeItem(SESSION_STORAGE_KEY); } catch { /* Storage can be unavailable in private mode. */ }
}

export function readRememberedUsername(storage: StorageLike | undefined = getStorage()): string {
  if (!storage) return "";
  try { return storage.getItem(REMEMBERED_USERNAME_STORAGE_KEY)?.trim() ?? ""; } catch { return ""; }
}

export function persistRememberedUsername(username: string, remember: boolean, storage: StorageLike | undefined = getStorage()): void {
  if (!storage) return;
  try {
    if (remember && username.trim()) storage.setItem(REMEMBERED_USERNAME_STORAGE_KEY, username.trim());
    else storage.removeItem(REMEMBERED_USERNAME_STORAGE_KEY);
  } catch {
    // Remembering the username is optional and must not block login.
  }
}

function getStorage(): StorageLike | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function isValidFutureDate(value?: string): boolean {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

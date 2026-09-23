export const FIELD_DB_VERSION = 2;
export const FIELD_STORES = [
  "package",
  "orders",
  "operations",
  "visits",
  "evidence",
  "sync",
  "conflicts",
  "drafts",
] as const;

export type FieldStoreName = (typeof FIELD_STORES)[number];

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export function openFieldDatabase(name = "sepsa-field-app"): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this runtime."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, FIELD_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of FIELD_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: keyPathFor(storeName) });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another connection."));
  });
}

function keyPathFor(storeName: FieldStoreName): string {
  switch (storeName) {
    case "package":
      return "packageId";
    case "orders":
      return "orderId";
    case "operations":
      return "operationId";
    case "visits":
      return "operationId";
    case "evidence":
      return "evidenceId";
    case "sync":
      return "operationId";
    case "conflicts":
      return "conflictId";
    case "drafts":
      return "draftId";
  }
}

export async function deleteFieldDatabase(name = "sepsa-field-app"): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to delete IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB deletion is blocked."));
  });
}

const AUTHORITY_DB_VERSION = 3;
const AUTHORITY_STORES = ["users", "sessions", "debtors", "orders", "operations", "audit", "device-bindings"] as const;

interface LegacyDeviceBinding {
  bindingId?: string;
  technicianId?: string;
  deviceId?: string;
  packageId?: string;
  boundAt?: string;
}

interface MigratedDeviceBinding {
  deviceId: string;
  technicianId: string;
  packageId: string;
  boundAt: string;
  ownershipStatus: "ACTIVE" | "CONFLICT";
  owners: string[];
  legacyBindings: LegacyDeviceBinding[];
}

export type AuthorityStoreName = (typeof AUTHORITY_STORES)[number];

export function openAuthorityDatabase(name = "sepsa-demo-authority"): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable in this runtime."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, AUTHORITY_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const legacyBindings = database.objectStoreNames.contains("device-bindings")
        ? request.transaction?.objectStore("device-bindings")
        : undefined;
      if (legacyBindings && legacyBindings.keyPath !== "deviceId") {
        const legacyRequest = legacyBindings.getAll();
        legacyRequest.onsuccess = () => {
          const records = legacyRequest.result as LegacyDeviceBinding[];
          database.deleteObjectStore("device-bindings");
          const migratedStore = database.createObjectStore("device-bindings", { keyPath: "deviceId" });
          for (const binding of migrateDeviceBindings(records)) migratedStore.put(binding);
        };
      }
      for (const store of AUTHORITY_STORES) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: authorityKeyPath(store) });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open authority IndexedDB."));
    request.onblocked = () => reject(new Error("Authority IndexedDB upgrade is blocked by another connection."));
  });
}

export function deleteAuthorityDatabase(name = "sepsa-demo-authority"): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to delete authority IndexedDB."));
    request.onblocked = () => reject(new Error("Authority IndexedDB deletion is blocked."));
  });
}

function authorityKeyPath(store: AuthorityStoreName): string {
  switch (store) {
    case "users": return "userId";
    case "sessions": return "sessionId";
    case "debtors": return "debtorId";
    case "orders": return "orderId";
    case "operations": return "operationId";
    case "audit": return "auditId";
    case "device-bindings": return "deviceId";
  }
}

function migrateDeviceBindings(records: LegacyDeviceBinding[]): MigratedDeviceBinding[] {
  const grouped = new Map<string, LegacyDeviceBinding[]>();
  for (const record of records) {
    if (typeof record.deviceId !== "string" || !record.deviceId.trim() || typeof record.technicianId !== "string" || !record.technicianId.trim()) continue;
    const entries = grouped.get(record.deviceId) ?? [];
    entries.push({ ...record });
    grouped.set(record.deviceId, entries);
  }

  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([deviceId, entries]) => {
    const ordered = entries.sort(compareLegacyBindings);
    const owners = [...new Set(ordered.map((entry) => entry.technicianId as string))].sort((left, right) => left.localeCompare(right));
    const first = ordered[0];
    const conflict = owners.length > 1;
    return {
      deviceId,
      technicianId: conflict ? "" : owners[0],
      packageId: conflict ? "" : first.packageId ?? "",
      boundAt: conflict ? "" : first.boundAt ?? "",
      ownershipStatus: conflict ? "CONFLICT" : "ACTIVE",
      owners,
      legacyBindings: ordered,
    };
  });
}

function compareLegacyBindings(left: LegacyDeviceBinding, right: LegacyDeviceBinding): number {
  return `${left.technicianId ?? ""}\u0000${left.packageId ?? ""}\u0000${left.boundAt ?? ""}\u0000${left.bindingId ?? ""}`
    .localeCompare(`${right.technicianId ?? ""}\u0000${right.packageId ?? ""}\u0000${right.boundAt ?? ""}\u0000${right.bindingId ?? ""}`);
}

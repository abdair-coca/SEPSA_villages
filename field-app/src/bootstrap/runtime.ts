/**
 * Store del técnico en modo conectado: usa los adaptadores que recibe (el cliente HTTP hace de transporte,
 * autorización y habilitación). El modo simulado vive en `simulated-runtime.ts` y no viaja en producción (D023).
 */
import type { IndexedDbLocalRepository } from "../adapters/indexeddb/repository";
import { MockConnectivity } from "../adapters/mock/connectivity";
import type { AppStore, PrepareExternalValidation } from "../state/store";
import { createAppStore } from "../state/store";
import type { AuthorizationAdapter, EnablementAdapter } from "../ports/authorization";
import type { WorkPackage } from "../domain/types";
import type { EvidenceUploadPort, SyncTransport } from "../ports/sync";

export interface AuthenticatedStoreOptions {
  repository: IndexedDbLocalRepository;
  seedPackage?: WorkPackage;
  transport: SyncTransport;
  authorization: AuthorizationAdapter;
  enablement: EnablementAdapter;
  technicianName?: string;
  prepareExternalValidation?: PrepareExternalValidation;
}

/** Store del técnico autenticado con los adaptadores del modo conectado. */
export function createAuthenticatedTechnicianStore(technicianId: string, deviceId: string, options: AuthenticatedStoreOptions): AppStore {
  // Solo guarda el modo de red; `FieldApp` lo actualiza con la conectividad real del navegador.
  const connectivity = new MockConnectivity("online");
  const { repository, seedPackage, transport, authorization, enablement, technicianName, prepareExternalValidation } = options;
  return createAppStore({ repository, authorization, enablement, connectivity, transport, evidenceUploader: isEvidenceUploader(transport) ? transport : undefined, technicianId, technicianName, deviceId, seedPackage, prepareExternalValidation });
}

/** El modo simulado se incluye solo en desarrollo o con `VITE_ENABLE_SIMULATION=true` (builds de humo). */
export function simulationEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_SIMULATION === "true";
}

export function isEvidenceUploader(value: unknown): value is EvidenceUploadPort {
  return typeof value === "object" && value !== null && "uploadEvidence" in value && typeof value.uploadEvidence === "function";
}

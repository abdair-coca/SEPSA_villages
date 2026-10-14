/**
 * Jornada del técnico: descarga el paquete asignado, crea el store con la fábrica del modo actual (conectado o
 * simulado) y refresca las órdenes asignadas cada 30 s. Sin red, abre el último paquete guardado.
 */
import { useEffect, useMemo, useState } from "react";
import { IndexedDbLocalRepository } from "./adapters/indexeddb/repository";
import { createSimulatedPackageEnvelope } from "./adapters/indexeddb/package-validation";
import { downloadAssigned } from "./use-cases/download";
import { AppStateCard } from "./components/common/UiState";
import { AppHeader, type AppHeaderRoleSwitch } from "./components/AppHeader";
import { FieldApp } from "./screens/FieldApp";
import { getStableDeviceId } from "./bootstrap/environment";
import type { Session, WorkPackageEnvelope } from "./domain/types";
import type { IdentityPort } from "./ports/identity";
import type { OperationsAuthorityPort } from "./ports/authority";
import type { ServerRecordSource, TechnicianRecordPort } from "./ports/technician-record";
import type { AppStore } from "./state/store";

/** Crea el store del técnico con los adaptadores del modo actual. */
export type TechnicianStoreFactory = (repository: IndexedDbLocalRepository, envelope: WorkPackageEnvelope, deviceId: string) => AppStore;

export function TechnicianRuntime({ authority, session, onLogout, roleSwitch, createStore, recordPort }: { authority: IdentityPort & OperationsAuthorityPort; session: Session; onLogout: () => void; roleSwitch?: AppHeaderRoleSwitch; createStore: TechnicianStoreFactory; recordPort?: TechnicianRecordPort }) {
  const [store, setStore] = useState<AppStore>();
  const [refreshAssigned, setRefreshAssigned] = useState<(() => Promise<void>)>();
  const [error, setError] = useState<string>();
  const deviceId = getStableDeviceId();
  const serverRecord = useMemo<ServerRecordSource | undefined>(
    () => recordPort
      ? {
        listOrder: (orderId) => recordPort.listOrderRecord(session, orderId),
        readEvidence: (evidenceId) => recordPort.readEvidence(session, evidenceId),
      }
      : undefined,
    [recordPort, session],
  );

  useEffect(() => {
    let active = true;
    const repository = new IndexedDbLocalRepository({ technicianId: session.userId, deviceId });
    void (async () => {
      try {
        const envelope = await loadPackage(authority, session, deviceId, repository);
        const nextStore = createStore(repository, envelope, deviceId);
        let refreshInFlight: Promise<void> | undefined;
        const refreshAssignedPackage = async (): Promise<void> => {
          if (refreshInFlight) return refreshInFlight;
          refreshInFlight = (async () => {
            const nextEnvelope = await loadPackage(authority, session, deviceId, repository);
            await repository.savePackage(nextEnvelope);
            await nextStore.refresh();
          })().finally(() => { refreshInFlight = undefined; });
          return refreshInFlight;
        };
        if (active) {
          setStore(nextStore);
          setRefreshAssigned(() => refreshAssignedPackage);
        } else await repository.close();
      } catch (reason) {
        await repository.close();
        if (active) setError(reason instanceof Error ? reason.message : "No pudimos descargar órdenes asignadas.");
      }
    })();
    return () => { active = false; void repository.close(); };
  }, [authority, deviceId, session]);

  useEffect(() => {
    if (!refreshAssigned) return;
    const interval = setInterval(() => { void refreshAssigned().catch(() => undefined); }, 30_000);
    return () => clearInterval(interval);
  }, [refreshAssigned]);

  if (error || !store) return <div className="field-app">
    {roleSwitch ? <AppHeader role="field" title="Jornada de campo" description="Órdenes asignadas y trabajo de campo."
      user={{ displayName: session.displayName ?? session.username, roleLabel: "Técnico" }}
      roleSwitch={roleSwitch} onLogout={onLogout} /> : null}
    {error
      ? <AppStateCard as="main" className="state-card" tone="error" title="No pudimos abrir jornada" description={error} action={{ label: "Volver al inicio", onClick: onLogout }} />
      : <AppStateCard as="main" className="state-card" tone="loading" title="Descargando jornada" description="Validando identidad y órdenes asignadas." />}
  </div>;
  return <FieldApp store={store} technicianId={session.userId} technicianName={session.displayName} deviceId={deviceId} enableReconnection onRefreshAssigned={refreshAssigned} onLogout={onLogout} roleSwitch={roleSwitch} serverRecord={serverRecord} />;
}

/**
 * Descarga el paquete asignado y lo guarda. Si no hay red, abre el último paquete guardado en el dispositivo
 * para poder trabajar sin conexión; cualquier otro error se muestra.
 */
async function loadPackage(authority: IdentityPort & OperationsAuthorityPort, session: Session, deviceId: string, repository: IndexedDbLocalRepository): Promise<WorkPackageEnvelope> {
  try {
    const knownVersion = await repository.latestPackageVersion();
    const envelope = await downloadAssigned(authority, session, deviceId, knownVersion);
    await repository.savePackage(envelope);
    return envelope;
  } catch (remoteError) {
    if (remoteError instanceof Error && remoteError.name !== "NetworkUnknownError") throw remoteError;
    try {
      return createSimulatedPackageEnvelope(await repository.loadAssignedPackage());
    } catch {
      throw remoteError;
    }
  }
}

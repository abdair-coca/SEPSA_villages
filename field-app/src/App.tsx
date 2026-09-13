import { useEffect, useState } from "react";
import { createAuthenticatedTechnicianStore, createUnavailableAppStore, SimulatedAuthoritySyncTransport } from "./app/index";
import { IndexedDbAuthorityRepository, IndexedDbLocalRepository, createSimulatedPackageEnvelope } from "./adapters/indexeddb";
import { HttpPilotClient } from "./adapters/http";
import { downloadAssigned } from "./application";
import { FieldApp, LoginScreen, OperationsApp } from "./ui";
import type { Session, WorkPackageEnvelope } from "./domain";
import type { IdentityPort, OperationsAuthorityPort } from "./ports";

const authority = typeof indexedDB === "undefined" ? undefined : new IndexedDbAuthorityRepository();
const pilotBackendUrl = import.meta.env.VITE_PILOT_BACKEND_URL?.trim();
const remoteAuthority = pilotBackendUrl ? new HttpPilotClient({ baseUrl: pilotBackendUrl }) : undefined;

export function App() {
  const [session, setSession] = useState<Session>();
  if (remoteAuthority) return <ConnectedApp authority={remoteAuthority} session={session} onAuthenticated={setSession} onLogout={() => setSession(undefined)} />;
  if (!authority) return <FieldApp store={createUnavailableAppStore()} />;
  if (!session) return <LoginScreen authority={authority} onAuthenticated={setSession} />;
  if (session.role === "ADMIN") return <OperationsApp authority={authority} session={session} onLogout={() => setSession(undefined)} />;
  return <TechnicianRuntime authority={authority} session={session} onLogout={() => setSession(undefined)} />;
}

function ConnectedApp({ authority, session, onAuthenticated, onLogout }: { authority: IdentityPort & OperationsAuthorityPort & HttpPilotClient; session?: Session; onAuthenticated: (session: Session) => void; onLogout: () => void }) {
  if (!session) return <LoginScreen authority={authority} onAuthenticated={onAuthenticated} environment="PILOT_PROVISIONAL" />;
  const logout = () => { void authority.logout(session).catch(() => undefined); onLogout(); };
  if (session.role === "ADMIN") return <OperationsApp authority={authority} session={session} onLogout={logout} environment="PILOT_PROVISIONAL" />;
  return <TechnicianRuntime authority={authority} session={session} onLogout={logout} remote />;
}

function TechnicianRuntime({ authority, session, onLogout, remote = false }: { authority: IdentityPort & OperationsAuthorityPort; session: Session; onLogout: () => void; remote?: boolean }) {
  const [store, setStore] = useState<ReturnType<typeof createAuthenticatedTechnicianStore>>();
  const [error, setError] = useState<string>();
  const deviceId = getStableDeviceId();

  useEffect(() => {
    let active = true;
    const repository = new IndexedDbLocalRepository({ technicianId: session.userId, deviceId });
    void (async () => {
      try {
        const envelope = await loadPackage(authority, session, deviceId, repository);
        const transport = remote ? authority as HttpPilotClient : new SimulatedAuthoritySyncTransport(authority as IndexedDbAuthorityRepository, session, repository);
        const nextStore = createAuthenticatedTechnicianStore(session.userId, deviceId, { repository, seedPackage: envelope.package, transport, authorization: remote ? authority as HttpPilotClient : undefined });
        if (active) setStore(nextStore); else await repository.close();
      } catch (reason) {
        await repository.close();
        if (active) setError(reason instanceof Error ? reason.message : "No pudimos descargar órdenes asignadas.");
      }
    })();
    return () => { active = false; void repository.close(); };
  }, [authority, deviceId, session]);

  if (error) return <main className="state-card state-card--error"><h2>No pudimos abrir jornada</h2><p>{error}</p><button className="primary-action" onClick={onLogout}>Volver al inicio</button></main>;
  if (!store) return <main className="state-card"><div className="loading-mark" /><h2>Descargando jornada</h2><p>Validando identidad y órdenes asignadas.</p></main>;
  return <><div className="session-bar"><span>Técnico: <strong>{session.username}</strong></span><button onClick={onLogout}>Cerrar sesión</button></div><FieldApp store={store} technicianId={session.userId} deviceId={deviceId} enableReconnection={!remote} environment={remote ? "PILOT_PROVISIONAL" : "SIMULATED"} /></>;
}

async function loadPackage(authority: IdentityPort & OperationsAuthorityPort, session: Session, deviceId: string, repository: IndexedDbLocalRepository): Promise<WorkPackageEnvelope> {
  try {
    const envelope = await downloadAssigned(authority, session, deviceId);
    await repository.savePackage(envelope);
    return envelope;
  } catch (remoteError) {
    try {
      return createSimulatedPackageEnvelope(await repository.loadAssignedPackage());
    } catch {
      throw remoteError;
    }
  }
}

function getStableDeviceId(): string {
  const storageKey = "sepsa.simulated.device-id";
  if (typeof localStorage === "undefined") throw new Error("No se pudo identificar este dispositivo.");
  const existing = localStorage.getItem(storageKey)?.trim();
  if (existing) return existing;
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (!randomUuid) throw new Error("No se pudo generar una identidad segura para este dispositivo.");
  const deviceId = `device-${randomUuid}`;
  localStorage.setItem(storageKey, deviceId);
  return deviceId;
}

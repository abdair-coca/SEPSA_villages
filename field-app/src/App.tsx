import { useEffect, useState } from "react";
import { createAuthenticatedTechnicianStore, createUnavailableAppStore, SimulatedAuthoritySyncTransport } from "./app/index";
import { IndexedDbAuthorityRepository, IndexedDbLocalRepository, createSimulatedPackageEnvelope } from "./adapters/indexeddb";
import { HttpPilotClient } from "./adapters/http";
import { downloadAssigned } from "./application";
import { FieldApp, LoginScreen, OperationsApp } from "./ui";
import type { Session, WorkPackageEnvelope } from "./domain";
import type { IdentityPort, OperationsAuthorityPort } from "./ports";
import { clearStoredSession, persistSession, readStoredSession } from "./application/session-persistence";

const authority = typeof indexedDB === "undefined" ? undefined : new IndexedDbAuthorityRepository();
const pilotBackendUrl = import.meta.env.VITE_PILOT_BACKEND_URL?.trim();
const remoteAuthority = pilotBackendUrl ? new HttpPilotClient({ baseUrl: pilotBackendUrl }) : undefined;
export function App() {
  const [session, setSession] = useState<Session | undefined>(() => readStoredSession());
  useEffect(() => {
    if (!session) return;
    if (!isValidFutureDate(session.expiresAt)) {
      clearStoredSession();
      setSession(undefined);
      return;
    }
    remoteAuthority?.restoreSession(session);
  }, [session]);

  const authenticate = (nextSession: Session): void => {
    persistSession(nextSession);
    setSession(nextSession);
  };
  const logout = (): void => {
    clearStoredSession();
    setSession(undefined);
  };

  if (remoteAuthority) return <ConnectedApp authority={remoteAuthority} session={session} onAuthenticated={authenticate} onLogout={logout} />;
  if (!authority) return <FieldApp store={createUnavailableAppStore()} />;
  if (!session) return <LoginScreen authority={authority} onAuthenticated={authenticate} />;
  if (session.role === "ADMIN") return <OperationsApp authority={authority} session={session} onLogout={logout} />;
  return <TechnicianRuntime authority={authority} session={session} onLogout={logout} />;
}

function ConnectedApp({ authority, session, onAuthenticated, onLogout }: { authority: IdentityPort & OperationsAuthorityPort & HttpPilotClient; session?: Session; onAuthenticated: (session: Session) => void; onLogout: () => void }) {
  if (!session) return <LoginScreen authority={authority} onAuthenticated={onAuthenticated} />;
  const logout = () => { void authority.logout(session).catch(() => undefined); onLogout(); };
  if (session.role === "ADMIN") return <OperationsApp authority={authority} session={session} onLogout={logout} technicianId="10000000-0000-4000-8000-000000000002" />;
  return <TechnicianRuntime authority={authority} session={session} onLogout={logout} remote />;
}

function TechnicianRuntime({ authority, session, onLogout, remote = false }: { authority: IdentityPort & OperationsAuthorityPort; session: Session; onLogout: () => void; remote?: boolean }) {
  const [store, setStore] = useState<ReturnType<typeof createAuthenticatedTechnicianStore>>();
  const [refreshAssigned, setRefreshAssigned] = useState<(() => Promise<void>)>();
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

  if (error) return <main className="state-card state-card--error"><h2>No pudimos abrir jornada</h2><p>{error}</p><button className="primary-action" onClick={onLogout}>Volver al inicio</button></main>;
  if (!store) return <main className="state-card"><div className="loading-mark" /><h2>Descargando jornada</h2><p>Validando identidad y órdenes asignadas.</p></main>;
  return <><div className="session-bar"><span>Técnico: <strong>{session.displayName ?? session.username}</strong></span><button onClick={onLogout}>Cerrar sesión</button></div><FieldApp store={store} technicianId={session.userId} technicianName={session.displayName} deviceId={deviceId} enableReconnection={!remote} onRefreshAssigned={refreshAssigned} /></>;
}

async function loadPackage(authority: IdentityPort & OperationsAuthorityPort, session: Session, deviceId: string, repository: IndexedDbLocalRepository): Promise<WorkPackageEnvelope> {
  try {
    const envelope = await downloadAssigned(authority, session, deviceId);
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

function isValidFutureDate(value?: string): boolean {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

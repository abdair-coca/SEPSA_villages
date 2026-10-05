import { useEffect, useRef, useState } from "react";
import { createAuthenticatedTechnicianStore, createUnavailableAppStore, SimulatedAuthoritySyncTransport } from "./app/index";
import { IndexedDbAuthorityRepository, IndexedDbLocalRepository, createSimulatedPackageEnvelope } from "./adapters/indexeddb";
import { HttpPilotClient } from "./adapters/http";
import { downloadAssigned } from "./application";
import { AppStateCard, ExitConfirmationModal, FieldApp, LoginScreen, OperationsApp } from "./ui";
import type { Session, WorkPackageEnvelope } from "./domain";
import type { IdentityPort, OperationsAuthorityPort } from "./ports";
import { clearStoredSession, persistSession, readStoredSession } from "./application/session-persistence";
import { AppHeader, type AppHeaderRoleSwitch } from "./ui/AppHeader";

const authority = typeof indexedDB === "undefined" ? undefined : new IndexedDbAuthorityRepository();
const pilotBackendUrl = resolvePilotBackendUrl();
const remoteAuthority = pilotBackendUrl ? new HttpPilotClient({ baseUrl: pilotBackendUrl }) : undefined;

const MOBILE_BACK_GUARD_KEY = "sepsa-mobile-back-guard";

interface MobileBackNavigationGuard {
  confirmExit: () => void;
  dispose: () => void;
}

export function App() {
  const [session, setSession] = useState<Session | undefined>(() => readStoredSession());
  const [isExitConfirmationOpen, setIsExitConfirmationOpen] = useState(false);
  const backGuardRef = useRef<MobileBackNavigationGuard | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const guard = installMobileBackNavigationGuard(window, () => setIsExitConfirmationOpen(true));
    if (!guard) return;
    backGuardRef.current = guard;
    return () => {
      guard.dispose();
      if (backGuardRef.current === guard) backGuardRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!authority || remoteAuthority) return;
    void authority.seedE2eData();
  }, []);
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

  const content = remoteAuthority
    ? <ConnectedApp authority={remoteAuthority} session={session} onAuthenticated={authenticate} onLogout={logout} />
    : !authority
      ? <FieldApp store={createUnavailableAppStore()} />
      : !session
        ? <LoginScreen authority={authority} onAuthenticated={authenticate} />
        : session.role === "ADMIN"
          ? <OperationsApp authority={authority} session={session} onLogout={logout} />
          : <TechnicianRuntime authority={authority} session={session} onLogout={logout} />;

  return <>
    {content}
    {isExitConfirmationOpen ? <ExitConfirmationModal onStay={() => setIsExitConfirmationOpen(false)} onExit={() => { setIsExitConfirmationOpen(false); backGuardRef.current?.confirmExit(); }} /> : null}
  </>;
}

export function installMobileBackNavigationGuard(target: Window, onRequestExit: () => void): MobileBackNavigationGuard | undefined {
  if (!target.matchMedia("(max-width: 760px)").matches) return undefined;

  const currentState = isRecord(target.history.state) ? target.history.state : {};
  if (!currentState[MOBILE_BACK_GUARD_KEY]) target.history.pushState({ ...currentState, [MOBILE_BACK_GUARD_KEY]: true }, "", target.location.href);

  let released = false;
  const handlePopState = (): void => {
    if (released) return;
    onRequestExit();
    const state = isRecord(target.history.state) ? target.history.state : {};
    target.history.pushState({ ...state, [MOBILE_BACK_GUARD_KEY]: true }, "", target.location.href);
  };
  target.addEventListener("popstate", handlePopState);

  return {
    confirmExit() {
      if (released) return;
      released = true;
      target.history.go(-2);
    },
    dispose() {
      target.removeEventListener("popstate", handlePopState);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ConnectedApp({ authority, session, onAuthenticated, onLogout }: { authority: IdentityPort & OperationsAuthorityPort & HttpPilotClient; session?: Session; onAuthenticated: (session: Session) => void; onLogout: () => void }) {
  const [switching, setSwitching] = useState(false);
  const [checkingSession, setCheckingSession] = useState(Boolean(session));
  const [roleError, setRoleError] = useState<string>();
  const switchingRef = useRef(false);
  const scopeRef = useRef(session);
  scopeRef.current = session;

  useEffect(() => {
    if (!session) { setCheckingSession(false); return; }
    let active = true;
    setCheckingSession(true);
    authority.restoreSession(session);
    void authority.currentSession(session).then((current) => {
      if (active) onAuthenticated(current);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof Error && "status" in error && error.status === 401) onLogout();
      else setRoleError("No pudimos validar los roles. Compruebe la conexión y vuelva a intentar.");
    }).finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [authority, session?.sessionId]);

  const switchRole = async (): Promise<void> => {
    if (!session || switchingRef.current || checkingSession) return;
    switchingRef.current = true;
    setSwitching(true);
    setRoleError(undefined);
    const targetRole = session.role === "ADMIN" ? "TECHNICIAN" : "ADMIN";
    try {
      const next = await authority.switchRole(session, targetRole);
      if (scopeRef.current === session) onAuthenticated(next);
    } catch (error) {
      if (scopeRef.current !== session) return;
      if (error instanceof Error && error.name === "NetworkUnknownError") {
        try {
          const current = await authority.currentSession(session);
          if (scopeRef.current !== session) return;
          onAuthenticated(current);
          if (current.role === targetRole) return;
        } catch { /* An uncertain remote result requires recovery on retry or reload. */ }
        setRoleError("No pudimos confirmar el rol activo. Compruebe la conexión y reintente o recargue. Sus pendientes siguen guardados.");
      } else setRoleError(error instanceof Error ? error.message : "No pudimos cambiar el rol. Vuelva a intentar.");
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  };

  if (!session) return <LoginScreen authority={authority} onAuthenticated={onAuthenticated} />;
  const logout = () => { void authority.logout(session).catch(() => undefined); onLogout(); };
  const roleSwitch: AppHeaderRoleSwitch | undefined = session.roles?.includes("ADMIN") && session.roles.includes("TECHNICIAN") ? {
    label: session.role === "ADMIN" ? "Cambiar a Técnico" : "Cambiar a Administrador",
    busy: switching,
    disabled: checkingSession,
    error: roleError,
    onSelect: () => void switchRole(),
  } : undefined;
  if (session.role === "ADMIN") return <OperationsApp authority={authority} session={session} onLogout={logout} roleSwitch={roleSwitch} />;
  return <TechnicianRuntime authority={authority} session={session} onLogout={logout} roleSwitch={roleSwitch} remote />;
}

function TechnicianRuntime({ authority, session, onLogout, roleSwitch, remote = false }: { authority: IdentityPort & OperationsAuthorityPort; session: Session; onLogout: () => void; roleSwitch?: AppHeaderRoleSwitch; remote?: boolean }) {
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
          const nextStore = createAuthenticatedTechnicianStore(session.userId, deviceId, { repository, seedPackage: envelope.package, transport, authorization: remote ? authority as HttpPilotClient : undefined, enablement: remote ? authority as HttpPilotClient : undefined, technicianName: session.displayName });
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
  return <FieldApp store={store} technicianId={session.userId} technicianName={session.displayName} deviceId={deviceId} enableReconnection onRefreshAssigned={refreshAssigned} onLogout={onLogout} roleSwitch={roleSwitch} />;
}

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

function resolvePilotBackendUrl(): string | undefined {
  const configured = import.meta.env.VITE_PILOT_BACKEND_URL?.trim();
  if (configured) return configured;
  if (!import.meta.env.PROD || typeof window === "undefined") return undefined;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return undefined;
  return window.location.origin;
}

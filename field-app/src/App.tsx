/**
 * Raíz de la aplicación: decide el modo, la sesión y qué pantalla mostrar.
 *
 * Modos:
 * - **Backend piloto** (hay URL de backend, ver `resolvePilotBackendUrl`): `HttpPilotClient` hace de autoridad,
 *   autorización, habilitación y transporte (`ConnectedApp`).
 * - **Simulado** (sin URL): `IndexedDbAuthorityRepository` hace de backend local con datos de demostración.
 *
 * Según el rol de la sesión muestra `OperationsApp` (ADMIN) o la jornada del técnico (`TechnicianRuntime`,
 * que descarga el paquete y crea el store). En móvil, el botón atrás pide confirmación antes de salir.
 */
import { useEffect, useRef, useState } from "react";
import { createAuthenticatedTechnicianStore, SimulatedAuthoritySyncTransport } from "./bootstrap/runtime";
import { createUnavailableAppStore } from "./state/store";
import { IndexedDbAuthorityRepository } from "./adapters/indexeddb/authority-repository";
import { IndexedDbLocalRepository } from "./adapters/indexeddb/repository";
import { createSimulatedPackageEnvelope } from "./adapters/indexeddb/package-validation";
import { HttpPilotClient } from "./adapters/http/client";
import { downloadAssigned } from "./use-cases/download";
import { AppStateCard } from "./components/common/UiState";
import { ExitConfirmationModal } from "./components/common/ExitConfirmationModal";
import { FieldApp } from "./screens/FieldApp";
import { LoginScreen } from "./screens/LoginScreen";
import { OperationsApp } from "./screens/OperationsApp";
import type { Session, WorkPackageEnvelope } from "./domain/types";
import type { IdentityPort } from "./ports/identity";
import type { OperationsAuthorityPort } from "./ports/authority";
import { clearStoredSession, persistSession, readStoredSession } from "./adapters/browser/session-persistence";
import { AppHeader, type AppHeaderRoleSwitch } from "./components/AppHeader";
import { installMobileBackNavigationGuard, type MobileBackNavigationGuard } from "./services/mobile-back-guard";
import { getStableDeviceId, resolvePilotBackendUrl } from "./bootstrap/environment";

const authority = typeof indexedDB === "undefined" ? undefined : new IndexedDbAuthorityRepository();
const pilotBackendUrl = resolvePilotBackendUrl();
const remoteAuthority = pilotBackendUrl ? new HttpPilotClient({ baseUrl: pilotBackendUrl }) : undefined;

/** Componente raíz. */
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

/** Modo backend piloto: valida la sesión guardada contra el backend y permite cambiar de rol. */
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

/**
 * Jornada del técnico: descarga el paquete asignado, crea el store con los adaptadores del modo actual y
 * refresca las órdenes asignadas cada 30 s.
 */
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

function isValidFutureDate(value?: string): boolean {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

/**
 * Raíz de la aplicación: decide el modo, la sesión y qué pantalla mostrar.
 *
 * Modos:
 * - **Conectado** (hay URL de backend, ver `resolvePilotBackendUrl`): `HttpPilotClient` hace de autoridad,
 *   autorización, habilitación y transporte (`ConnectedApp`).
 * - **Simulado** (sin URL, solo en desarrollo o con `VITE_ENABLE_SIMULATION=true`): `SimulatedApp`, cargado con
 *   `import()` para que no viaje en el build de producción (D023).
 * - Sin URL ni simulación: aviso de que no hay servidor configurado.
 *
 * Según el rol de la sesión muestra `OperationsApp` (ADMIN) o la jornada del técnico (`TechnicianRuntime`).
 * En móvil, el botón atrás pide confirmación antes de salir.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createAuthenticatedTechnicianStore, simulationEnabled } from "./bootstrap/runtime";
import { HttpPilotClient } from "./adapters/http/client";
import { AppStateCard } from "./components/common/UiState";
import { ExitConfirmationModal } from "./components/common/ExitConfirmationModal";
import { LoginScreen } from "./screens/LoginScreen";
import { OperationsApp } from "./screens/OperationsApp";
import { TechnicianRuntime } from "./TechnicianRuntime";
import type { Session } from "./domain/types";
import type { IdentityPort } from "./ports/identity";
import type { OperationsAuthorityPort } from "./ports/authority";
import { clearStoredSession, persistSession, readStoredSession } from "./adapters/browser/session-persistence";
import type { AppHeaderRoleSwitch } from "./components/AppHeader";
import { installMobileBackNavigationGuard, type MobileBackNavigationGuard } from "./services/mobile-back-guard";
import { resolvePilotBackendUrl } from "./bootstrap/environment";

const pilotBackendUrl = resolvePilotBackendUrl();
const remoteAuthority = pilotBackendUrl ? new HttpPilotClient({ baseUrl: pilotBackendUrl }) : undefined;
// `simulationEnabled()` es constante en el build: sin la bandera, el import() del modo simulado se elimina.
const SimulatedApp = !remoteAuthority && simulationEnabled() ? lazy(() => import("./SimulatedApp")) : undefined;

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
    : SimulatedApp
      ? <Suspense fallback={<AppStateCard as="main" className="state-card" tone="loading" title="Abriendo" description="Preparando la aplicación." />}><SimulatedApp session={session} onAuthenticated={authenticate} onLogout={logout} /></Suspense>
      : <AppStateCard as="main" className="state-card" tone="error" title="No hay conexión con el servidor" description="La aplicación no tiene configurado su servidor. Avise al administrador." />;

  return <>
    {content}
    {isExitConfirmationOpen ? <ExitConfirmationModal onStay={() => setIsExitConfirmationOpen(false)} onExit={() => { setIsExitConfirmationOpen(false); backGuardRef.current?.confirmExit(); }} /> : null}
  </>;
}

/** Modo conectado: valida la sesión guardada contra el backend y permite cambiar de rol. */
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
  return <TechnicianRuntime authority={authority} session={session} onLogout={logout} roleSwitch={roleSwitch} createStore={(repository, envelope, deviceId) => createAuthenticatedTechnicianStore(session.userId, deviceId, {
    repository,
    seedPackage: envelope.package,
    transport: authority,
    authorization: authority,
    enablement: authority,
    technicianName: session.displayName,
  })} />;
}

function isValidFutureDate(value?: string): boolean {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

/**
 * Modo simulado (sin URL de backend): `IndexedDbAuthorityRepository` hace de backend local con datos de
 * demostración. `App.tsx` solo carga este módulo con `import()` si `simulationEnabled()`; en el build de producción
 * no viaja (D023).
 */
import { useEffect } from "react";
import { IndexedDbAuthorityRepository } from "./adapters/indexeddb/authority-repository";
import { createSimulatedTechnicianStore, SimulatedAuthoritySyncTransport } from "./bootstrap/simulated-runtime";
import { createUnavailableAppStore } from "./state/store";
import { FieldApp } from "./screens/FieldApp";
import { LoginScreen } from "./screens/LoginScreen";
import { OperationsApp } from "./screens/OperationsApp";
import { TechnicianRuntime } from "./TechnicianRuntime";
import type { Session } from "./domain/types";

const authority = typeof indexedDB === "undefined" ? undefined : new IndexedDbAuthorityRepository();

export default function SimulatedApp({ session, onAuthenticated, onLogout }: { session?: Session; onAuthenticated: (session: Session) => void; onLogout: () => void }) {
  useEffect(() => {
    void authority?.seedE2eData();
  }, []);

  if (!authority) return <FieldApp store={createUnavailableAppStore()} />;
  if (!session) return <LoginScreen authority={authority} onAuthenticated={onAuthenticated} />;
  if (session.role === "ADMIN") return <OperationsApp authority={authority} session={session} onLogout={onLogout} />;
  return <TechnicianRuntime authority={authority} session={session} onLogout={onLogout} createStore={(repository, envelope, deviceId) => createSimulatedTechnicianStore(session.userId, deviceId, {
    repository,
    seedPackage: envelope.package,
    transport: new SimulatedAuthoritySyncTransport(authority, session, repository),
    technicianName: session.displayName,
  })} />;
}

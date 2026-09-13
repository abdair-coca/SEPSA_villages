import { useState, type FormEvent } from "react";
import type { DemoCredentials, Session } from "../domain";
import type { IdentityPort } from "../ports";

export function LoginScreen({ authority, onAuthenticated, environment = "SIMULATED" }: { authority: IdentityPort; onAuthenticated: (session: Session) => void; environment?: "SIMULATED" | "PILOT_PROVISIONAL" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { const session = await authority.authenticate({ username, password } satisfies DemoCredentials); onAuthenticated(session); } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos validar identidad."); } finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card"><span className="eyebrow">SEPSA · PILOTO OPERATIVO</span><h1>Ingresar a jornada</h1><p>Identidad y permisos se validan antes de mostrar información operativa.</p><form className="login-form" onSubmit={submit}><label className="text-field"><span>Usuario</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label className="text-field"><span>Contraseña</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-action" disabled={busy}>{busy ? "Validando…" : "Ingresar"}<span>→</span></button></form><div className="simulation-note"><strong>Entorno {environment}</strong><span>{environment === "SIMULATED" ? "Use credenciales definidas en documentación del piloto. No es identidad institucional." : "Backend provisional conectado. No es integración oficial SEPSA."}</span></div></section></main>;
}

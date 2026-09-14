import { useState, type FormEvent } from "react";
import type { DemoCredentials, Session } from "../domain";
import type { IdentityPort } from "../ports";
import { persistRememberedUsername, readRememberedUsername } from "../application/session-persistence";

export function LoginScreen({ authority, onAuthenticated }: { authority: IdentityPort; onAuthenticated: (session: Session) => void }) {
  const [username, setUsername] = useState(() => readRememberedUsername());
  const [password, setPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const session = await authority.authenticate({ username, password } satisfies DemoCredentials);
      persistRememberedUsername(username, rememberUsername);
      onAuthenticated(session);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos validar identidad."); } finally { setBusy(false); }
  }
  return <main className="login-shell"><section className="login-card"><span className="eyebrow">SEPSA · SISTEMA DE OPERACIONES</span><h1>Ingresar al sistema</h1><p>Identidad y permisos se validan antes de mostrar información operativa.</p><form className="login-form" onSubmit={submit}><label className="text-field"><span>Usuario</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label><label className="text-field"><span>Contraseña</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label className="checkbox-field"><input type="checkbox" checked={rememberUsername} onChange={(event) => setRememberUsername(event.target.checked)} /><span>Recordar usuario en este dispositivo</span></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-action" disabled={busy}>{busy ? "Validando…" : "Ingresar"}<span>→</span></button></form><div className="simulation-note"><strong>Acceso seguro</strong><span>La sesión dura 7 días. La contraseña nunca se guarda en la aplicación; el navegador puede recordarla de forma segura.</span></div></section></main>;
}

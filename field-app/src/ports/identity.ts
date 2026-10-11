import type { AuthorizedAction, DemoCredentials, Session } from "../domain/types";

/** Autenticación y verificación de permisos de la sesión. */
export interface IdentityPort {
  authenticate(input: DemoCredentials): Promise<Session>;
  authorize(session: Session, action: AuthorizedAction): Promise<void>;
}

import type { AuthorizedAction, DemoCredentials, Session } from "../domain";
import type { IdentityPort } from "../ports";

export function login(identity: IdentityPort, credentials: DemoCredentials): Promise<Session> {
  return identity.authenticate(credentials);
}

export function authorize(identity: IdentityPort, session: Session, action: AuthorizedAction): Promise<void> {
  return identity.authorize(session, action);
}

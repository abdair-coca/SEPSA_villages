import type { AuthorizedAction, DemoCredentials, Session } from "../domain";

export interface IdentityPort {
  authenticate(input: DemoCredentials): Promise<Session>;
  authorize(session: Session, action: AuthorizedAction): Promise<void>;
}

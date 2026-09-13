import type { Session, WorkPackageEnvelope } from "../domain";
import type { IdentityPort, OperationsAuthorityPort } from "../ports";

type DownloadAuthority = OperationsAuthorityPort & IdentityPort;

export async function downloadAssigned(authority: DownloadAuthority, session: Session, deviceId: string): Promise<WorkPackageEnvelope> {
  await authority.authorize(session, "DOWNLOAD_ASSIGNED");
  return authority.downloadAssigned(session.userId, deviceId, session);
}

export function createDownloadCase(authority: DownloadAuthority, identity: IdentityPort) {
  return {
    downloadAssigned: (session: Session, deviceId: string) => downloadAssigned(authority, session, deviceId),
    authorize: (session: Session) => identity.authorize(session, "DOWNLOAD_ASSIGNED"),
  };
}

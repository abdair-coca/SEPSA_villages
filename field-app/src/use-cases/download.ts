/**
 * Caso de uso: descargar el paquete de órdenes asignadas al técnico para su dispositivo.
 * `knownVersion` permite al backend responder solo si hay una versión más nueva.
 */
import type { Session, WorkPackageEnvelope } from "../domain/types";
import type { IdentityPort } from "../ports/identity";
import type { OperationsAuthorityPort } from "../ports/authority";

type DownloadAuthority = OperationsAuthorityPort & IdentityPort;

export async function downloadAssigned(authority: DownloadAuthority, session: Session, deviceId: string, knownVersion?: number): Promise<WorkPackageEnvelope> {
  await authority.authorize(session, "DOWNLOAD_ASSIGNED");
  return authority.downloadAssigned(session.userId, deviceId, session, knownVersion);
}

export function createDownloadCase(authority: DownloadAuthority, identity: IdentityPort) {
  return {
    downloadAssigned: (session: Session, deviceId: string) => downloadAssigned(authority, session, deviceId),
    authorize: (session: Session) => identity.authorize(session, "DOWNLOAD_ASSIGNED"),
  };
}

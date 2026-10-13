/**
 * SQL de las autorizaciones de corte y habilitaciones de reconexión (`cut_authorizations`, una sola tabla con
 * `action = CUT | RECONNECTION`). Solo ejecuta consultas y devuelve filas; las reglas (vínculo, vencimiento,
 * consumo de un solo uso) las decide quien llama (`services/authorizations.service.ts` y el servicio de sync).
 * Los bloqueos `FOR UPDATE` se conservan tal cual: el orden de las consultas lo fija el servicio.
 */
import type { Queryable } from "../db.js";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";

export interface ExistingCutAuthorization {
  authorization_id: string;
  expires_at: string;
  technician_id: string;
  action: string;
}

export interface ExistingReconnectionAuthorization {
  technician_id: string;
  order_id: string;
  device_id: string;
  action: string;
}

export interface ActiveReconnectionAuthorization {
  authorization_id: string;
  operation_id: string;
  status: string;
}

/** Autorización (corte o reconexión) leída por `authorization_id` para consumirla. */
export interface AuthorizationGrant {
  authorization_id: string;
  operation_id: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string | null;
  device_id: string;
  order_version: number;
  token_hash: string;
  status: string;
  expires_at: string;
  consumed_operation_id: string | null;
  action: string;
}

export interface AuthorizationLookupGrant {
  authorization_id: string;
  technician_id: string;
  status: string;
  expires_at: string;
}

export interface InsertAuthorizationInput {
  authorizationId: string;
  operationId: string;
  orderId: string;
  technicianId: string;
  deviceId: string;
  orderVersion: number;
  tokenHash: string;
  expiresAt: string;
  technicianNameSnapshot: string;
}

export async function findCutAuthorizationByOperation(client: Queryable, operationId: string): Promise<ExistingCutAuthorization | undefined> {
  const existing = await client.query<ExistingCutAuthorization>("SELECT authorization_id, expires_at, technician_id, action FROM cut_authorizations WHERE operation_id = $1", [operationId]);
  return existing.rows[0];
}

export async function insertCutAuthorization(client: Queryable, input: InsertAuthorizationInput): Promise<void> {
  await client.query(
    `INSERT INTO cut_authorizations(authorization_id, operation_id, order_id, technician_id, device_id, order_version, token_hash, status, expires_at, source, action, technician_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8, $9, 'CUT', $10)`,
    [input.authorizationId, input.operationId, input.orderId, input.technicianId, input.deviceId, input.orderVersion, input.tokenHash, input.expiresAt, PROVISIONAL_SOURCE, input.technicianNameSnapshot],
  );
}

export async function insertReconnectionAuthorization(client: Queryable, input: InsertAuthorizationInput): Promise<void> {
  await client.query(
    `INSERT INTO cut_authorizations(authorization_id, operation_id, order_id, technician_id, device_id, order_version, token_hash, status, expires_at, source, action, technician_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8, $9, 'RECONNECTION', $10)`,
    [input.authorizationId, input.operationId, input.orderId, input.technicianId, input.deviceId, input.orderVersion, input.tokenHash, input.expiresAt, PROVISIONAL_SOURCE, input.technicianNameSnapshot],
  );
}

/** Marca como vencidas las reservas de reconexión de la orden cuya hora de vencimiento (de la base) ya pasó. */
export async function expireStaleReconnectionReservations(client: Queryable, orderId: string): Promise<void> {
  await client.query("UPDATE cut_authorizations SET status = 'EXPIRED' WHERE order_id = $1 AND action = 'RECONNECTION' AND status = 'RESERVED' AND expires_at <= clock_timestamp()", [orderId]);
}

export async function findAuthorizationByOperationForUpdate(client: Queryable, operationId: string): Promise<ExistingReconnectionAuthorization | undefined> {
  const existing = await client.query<ExistingReconnectionAuthorization>("SELECT technician_id, order_id, device_id, action, status FROM cut_authorizations WHERE operation_id = $1 FOR UPDATE", [operationId]);
  return existing.rows[0];
}

export async function findActiveReconnectionForUpdate(client: Queryable, orderId: string): Promise<ActiveReconnectionAuthorization | undefined> {
  const active = await client.query<ActiveReconnectionAuthorization>("SELECT authorization_id, operation_id, status FROM cut_authorizations WHERE order_id = $1 AND action = 'RECONNECTION' AND status IN ('RESERVED', 'CONSUMED') FOR UPDATE", [orderId]);
  return active.rows[0];
}

/** Rechaza una reserva que sigue sin consumirse (por ejemplo, al reemplazarla o si la orden cambió). */
export async function rejectReservedAuthorization(client: Queryable, authorizationId: string): Promise<void> {
  await client.query("UPDATE cut_authorizations SET status = 'REJECTED' WHERE authorization_id = $1 AND status = 'RESERVED'", [authorizationId]);
}

/** Marca como vencida una reserva concreta que seguía `RESERVED`. */
export async function expireReservedAuthorization(client: Queryable, authorizationId: string): Promise<void> {
  await client.query("UPDATE cut_authorizations SET status = 'EXPIRED' WHERE authorization_id = $1 AND status = 'RESERVED'", [authorizationId]);
}

export async function findAuthorizationGrantForUpdate(client: Queryable, authorizationId: string): Promise<AuthorizationGrant | undefined> {
  const grantResult = await client.query<AuthorizationGrant>("SELECT authorization_id, operation_id, order_id, technician_id, technician_name_snapshot, device_id, order_version, token_hash, status, expires_at, consumed_operation_id, action FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE", [authorizationId]);
  return grantResult.rows[0];
}

/** Consume la habilitación de reconexión una sola vez, solo si sigue reservada y no venció (hora de la base). Devuelve las filas afectadas. */
export async function consumeReconnectionAuthorization(client: Queryable, authorizationId: string, operationId: string): Promise<number | null> {
  const consumedResult = await client.query("UPDATE cut_authorizations SET status = 'CONSUMED', consumed_at = clock_timestamp(), consumed_operation_id = $2 WHERE authorization_id = $1 AND action = 'RECONNECTION' AND status = 'RESERVED' AND expires_at > clock_timestamp()", [authorizationId, operationId]);
  return consumedResult.rowCount;
}

/** Estado de la autorización de una acción (`CUT` o `RECONNECTION`) por `operation_id`, sin token. */
export async function findGrantStatusByOperationForUpdate(client: Queryable, operationId: string, action: "CUT" | "RECONNECTION"): Promise<AuthorizationLookupGrant | undefined> {
  const rows = await client.query<AuthorizationLookupGrant>("SELECT authorization_id, technician_id, status, expires_at FROM cut_authorizations WHERE operation_id = $1 AND action = $2 FOR UPDATE", [operationId, action]);
  return rows.rows[0];
}

export interface SyncReconnectionAuthorizationRow {
  authorization_id: string;
  operation_id: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string | null;
  device_id: string;
  order_version: number;
  status: string;
  consumed_operation_id: string | null;
  action: string;
}

export interface SyncCutAuthorizationRow {
  authorization_id: string;
  operation_id: string;
  token_hash: string;
  status: string;
  order_id: string;
  technician_id: string;
  technician_name_snapshot: string | null;
  device_id: string;
  order_version: number;
  action: string;
  consumed_operation_id: string | null;
}

/** Habilitación de reconexión ya consumida, leída al aceptar el sync de la reconexión. */
export async function findReconnectionAuthorizationForSyncForUpdate(client: Queryable, authorizationId: string): Promise<SyncReconnectionAuthorizationRow | undefined> {
  const authorization = await client.query<SyncReconnectionAuthorizationRow>(
    "SELECT authorization_id, operation_id, order_id, technician_id, technician_name_snapshot, device_id, order_version, status, consumed_operation_id, action FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE",
    [authorizationId],
  );
  return authorization.rows[0];
}

/** Autorización de corte (reservada o ya consumida por esta operación), leída al aceptar el sync del CUT. */
export async function findCutAuthorizationForSyncForUpdate(client: Queryable, authorizationId: string): Promise<SyncCutAuthorizationRow | undefined> {
  const authorization = await client.query<SyncCutAuthorizationRow>(
    "SELECT authorization_id, operation_id, token_hash, status, order_id, technician_id, technician_name_snapshot, device_id, order_version, action, consumed_operation_id FROM cut_authorizations WHERE authorization_id = $1 FOR UPDATE",
    [authorizationId],
  );
  return authorization.rows[0];
}

/** Consumo de un solo uso: pasa de RESERVED a CONSUMED solo si no venció (hora de la base, no del cliente). Devuelve las filas afectadas. */
export async function consumeCutAuthorization(client: Queryable, authorizationId: string, operationId: string): Promise<number | null> {
  const consumedAuthorization = await client.query("UPDATE cut_authorizations SET status = 'CONSUMED', consumed_at = clock_timestamp(), consumed_operation_id = $2 WHERE authorization_id = $1 AND action = 'CUT' AND status = 'RESERVED' AND expires_at > clock_timestamp()", [authorizationId, operationId]);
  return consumedAuthorization.rowCount;
}

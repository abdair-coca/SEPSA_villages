/**
 * Idempotencia de comandos administrativos por `operation_id`.
 * - Primer envío: reserva el id (`pending`) dentro de la transacción del comando.
 * - Mismo id, mismo tipo, mismo actor y mismo hash de petición: devuelve la respuesta guardada (replay).
 * - Mismo id con otros datos: `IDEMPOTENCY_CONFLICT`. Si todavía no hay respuesta: `OPERATION_IN_PROGRESS`.
 */
import type { PoolClient } from "pg";
import { HttpError } from "../http/responses.js";
import { PROVISIONAL_SOURCE } from "./application-context.js";
import { projectCommandResponse } from "../mappers/command-response.mapper.js";

interface CommandRow {
  operation_type: string;
  actor_id: string;
  request_hash: string;
  response: unknown;
}

export async function claimCommand(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<{ claimed: true } | { claimed: false; replay: unknown }> {
  const inserted = await client.query(
    "INSERT INTO command_operations(operation_id, operation_type, actor_id, request_hash, status, source) VALUES ($1, $2, $3, $4, 'pending', $5) ON CONFLICT (operation_id) DO NOTHING",
    [operationId, operationType, actorId, requestHash, PROVISIONAL_SOURCE],
  );
  if (inserted.rowCount === 1) return { claimed: true };
  const replay = await commandReplay(client, operationId, operationType, actorId, requestHash);
  if (replay === undefined) throw new HttpError(409, "OPERATION_IN_PROGRESS", "Operation is already in progress.");
  return { claimed: false, replay };
}

async function commandReplay(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<unknown | undefined> {
  const result = await client.query<CommandRow>("SELECT operation_type, actor_id, request_hash, response FROM command_operations WHERE operation_id = $1 FOR UPDATE", [operationId]);
  const row = result.rows[0];
  if (!row) return undefined;
  if (row.operation_type !== operationType || row.actor_id !== actorId || row.request_hash !== requestHash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Operation identifier is already bound to another command.");
  if (row.response === null || row.response === undefined) throw new HttpError(409, "OPERATION_IN_PROGRESS", "Operation is already in progress.");
  return projectCommandResponse(row.response);
}

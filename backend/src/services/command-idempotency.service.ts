/**
 * Idempotencia de comandos administrativos por `operation_id`.
 * - Primer envío: reserva el id (`pending`) dentro de la transacción del comando.
 * - Mismo id, mismo tipo, mismo actor y mismo hash de petición: devuelve la respuesta guardada (replay).
 * - Mismo id con otros datos: `IDEMPOTENCY_CONFLICT`. Si todavía no hay respuesta: `OPERATION_IN_PROGRESS`.
 * Es un servicio (y no un repositorio) porque decide con `HttpError`; el SQL está en
 * `repositories/commands.repository.ts`. Las consultas se ejecutan en el mismo orden que antes.
 */
import type { PoolClient } from "pg";
import { HttpError } from "../http/responses.js";
import { projectCommandResponse } from "../mappers/command-response.mapper.js";
import { findCommandForUpdate, insertPendingCommand } from "../repositories/commands.repository.js";

export async function claimCommand(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<{ claimed: true } | { claimed: false; replay: unknown }> {
  const insertedCount = await insertPendingCommand(client, operationId, operationType, actorId, requestHash);
  if (insertedCount === 1) return { claimed: true };
  const replay = await commandReplay(client, operationId, operationType, actorId, requestHash);
  if (replay === undefined) throw new HttpError(409, "OPERATION_IN_PROGRESS", "Operation is already in progress.");
  return { claimed: false, replay };
}

async function commandReplay(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<unknown | undefined> {
  const row = await findCommandForUpdate(client, operationId);
  if (!row) return undefined;
  if (row.operation_type !== operationType || row.actor_id !== actorId || row.request_hash !== requestHash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Operation identifier is already bound to another command.");
  if (row.response === null || row.response === undefined) throw new HttpError(409, "OPERATION_IN_PROGRESS", "Operation is already in progress.");
  return projectCommandResponse(row.response);
}

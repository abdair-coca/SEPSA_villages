/**
 * SQL de la tabla `command_operations`, el registro de idempotencia de los comandos administrativos.
 * Solo ejecuta consultas: la decisión de replay, conflicto o "en curso" vive en
 * `services/command-idempotency.service.ts`.
 */
import type { PoolClient } from "pg";
import { PROVISIONAL_SOURCE } from "../shared/application-context.js";

export interface CommandRow {
  operation_type: string;
  actor_id: string;
  request_hash: string;
  response: unknown;
}

/** Reserva el id como `pending`; devuelve las filas insertadas (0 si el id ya existía). */
export async function insertPendingCommand(client: PoolClient, operationId: string, operationType: string, actorId: string, requestHash: string): Promise<number | null> {
  const inserted = await client.query(
    "INSERT INTO command_operations(operation_id, operation_type, actor_id, request_hash, status, source) VALUES ($1, $2, $3, $4, 'pending', $5) ON CONFLICT (operation_id) DO NOTHING",
    [operationId, operationType, actorId, requestHash, PROVISIONAL_SOURCE],
  );
  return inserted.rowCount;
}

export async function findCommandForUpdate(client: PoolClient, operationId: string): Promise<CommandRow | undefined> {
  const result = await client.query<CommandRow>("SELECT operation_type, actor_id, request_hash, response FROM command_operations WHERE operation_id = $1 FOR UPDATE", [operationId]);
  return result.rows[0];
}

/** Guarda la respuesta del comando y lo marca `completed` para que un reintento la reciba igual. */
export async function completeCommand(client: PoolClient, operationId: string, response: unknown): Promise<void> {
  await client.query("UPDATE command_operations SET status = 'completed', response = $2 WHERE operation_id = $1", [operationId, response]);
}

/**
 * SQL de las operaciones sincronizadas (`sync_operations`). Solo ejecuta consultas y devuelve filas; las
 * reglas de idempotencia, conflicto y aceptación viven en los servicios (`services/sync*.service.ts`,
 * `services/authorizations.service.ts`).
 */
import type { Queryable } from "../db.js";

/** Operaciones CUT confirmadas de la orden, bloqueadas en modo compartido: un ciclo de corte válido tiene exactamente una. */
export async function listAcknowledgedCutOperationsShared(client: Queryable, orderId: string): Promise<string[]> {
  const cuts = await client.query<{ operation_id: string }>("SELECT operation_id FROM sync_operations WHERE order_id = $1 AND action = 'CUT' AND status = 'acknowledged' FOR SHARE", [orderId]);
  return cuts.rows.map((row) => row.operation_id);
}

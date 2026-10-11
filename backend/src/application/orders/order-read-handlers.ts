/**
 * Lista de órdenes para el administrador.
 */
import type { ServerResponse } from "node:http";
import { sendJson } from "../../http.js";
import type { SessionUser } from "../../types.js";
import { PROVISIONAL_SOURCE, type ApplicationContext } from "../application-context.js";
import { orderSelect, toOrder, type OrderRow } from "../projections/order.js";
import { requireRole } from "../shared/request-validation.js";

export interface OrderReadHandlers {
  listOrders(response: ServerResponse, user: SessionUser): Promise<void>;
}

export function createOrderReadHandlers(context: ApplicationContext): OrderReadHandlers {
  async function listOrders(response: ServerResponse, user: SessionUser): Promise<void> {
    requireRole(user, "ADMIN");
    const result = await context.pool.query<OrderRow>(orderSelect("o.source = $1", "o.created_at DESC"), [PROVISIONAL_SOURCE]);
    sendJson(response, 200, { source: PROVISIONAL_SOURCE, orders: result.rows.map(toOrder) });
  }

  return { listOrders };
}

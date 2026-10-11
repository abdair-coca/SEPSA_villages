/**
 * Agrupa los endpoints de órdenes: catálogo de técnicos, lectura, comandos y paquete de trabajo.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionUser } from "../types.js";
import type { ApplicationContext } from "../shared/application-context.js";
import { createCatalogHandlers } from "./orders-catalog.controller.js";
import { createOrderCommandHandlers } from "./orders-commands.controller.js";
import { createOrderReadHandlers } from "./orders-read.controller.js";
import { createWorkPackageHandlers } from "./orders-work-package.controller.js";

export interface OrderHandlers {
  listTechnicians(response: ServerResponse, user: SessionUser): Promise<void>;
  listOrders(response: ServerResponse, user: SessionUser): Promise<void>;
  createOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  createOrdersBatch(request: IncomingMessage, response: ServerResponse, user: SessionUser): Promise<void>;
  assignOrder(request: IncomingMessage, response: ServerResponse, user: SessionUser, orderId: string | undefined): Promise<void>;
  technicianOrders(response: ServerResponse, user: SessionUser, url: URL): Promise<void>;
}

export function createOrderHandlers(context: ApplicationContext): OrderHandlers {
  return {
    ...createCatalogHandlers(context),
    ...createOrderCommandHandlers(context),
    ...createOrderReadHandlers(context),
    ...createWorkPackageHandlers(context),
  };
}

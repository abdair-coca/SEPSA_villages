import type { ConnectivityMode } from "../domain/types";

/** Estado de conectividad del dispositivo. `isUsable()` indica si vale la pena intentar operaciones remotas. */
export interface ConnectivityPort {
  getMode(): ConnectivityMode;
  isUsable(): boolean;
}

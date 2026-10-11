import type { ConnectivityMode } from "../domain/types";

export interface ConnectivityPort {
  getMode(): ConnectivityMode;
  isUsable(): boolean;
}

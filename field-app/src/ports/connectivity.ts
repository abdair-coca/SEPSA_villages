import type { ConnectivityMode } from "../domain";

export interface ConnectivityPort {
  getMode(): ConnectivityMode;
  isUsable(): boolean;
}

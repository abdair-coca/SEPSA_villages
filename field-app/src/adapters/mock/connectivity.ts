import type { ConnectivityMode } from "../../domain/types";
import type { ConnectivityPort } from "../../ports/connectivity";

export class MockConnectivity implements ConnectivityPort {
  constructor(private mode: ConnectivityMode = "online") {}

  getMode(): ConnectivityMode {
    return this.mode;
  }

  isUsable(): boolean {
    return this.mode !== "offline";
  }

  setMode(mode: ConnectivityMode): void {
    this.mode = mode;
  }
}

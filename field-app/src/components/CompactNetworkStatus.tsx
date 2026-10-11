/** Indicador compacto del modo de conectividad (red disponible, señal débil o sin conexión). Solo presenta. */
import type { ConnectivityMode } from "../domain/types";

export function CompactNetworkStatus({ mode }: { mode: ConnectivityMode }) {
  const label = mode === "offline" ? "Sin conexión" : mode === "weak" ? "Señal débil" : "Red disponible";
  return <span className={`compact-network-status compact-network-status--${mode}`} role="status">
    <span className={`network-dot network-dot--${mode}`} aria-hidden="true" />{label}
  </span>;
}

/** Texto "Última actualización" del encabezado del técnico; se refresca cada 10 s y al pulsarlo pide actualizar. */
import { useEffect, useState } from "react";
import { formatLastUpdate } from "../utils/format";

export function LastUpdateDisplay({
  timestamp,
  isRefreshing,
  onRefresh,
}: {
  timestamp?: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => (typeof Date !== "undefined" ? Date.now() : 0));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const { relative, exact } = formatLastUpdate(timestamp, nowMs);

  return (
    <div
      className="last-update"
      onClick={onRefresh}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRefresh();
        }
      }}
      title={exact ? `Actualizado a las ${exact}. Clic para actualizar jornada.` : "Clic para actualizar jornada."}
    >
      <span className="last-update-label">Última actualización</span>
      <br />
      <strong>
        {isRefreshing ? "Actualizando…" : relative}
        {exact && !isRefreshing ? <span className="last-update-exact"> ({exact})</span> : null}
      </strong>
    </div>
  );
}

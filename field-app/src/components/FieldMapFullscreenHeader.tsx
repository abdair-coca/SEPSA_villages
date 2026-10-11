/** Encabezado del mapa en pantalla completa con el botón de cierre. Solo presenta; el cierre lo decide quien lo usa. */
import type { RefObject } from "react";

export function FullscreenMapHeader({ closeRef, onClose }: { closeRef: RefObject<HTMLButtonElement | null>; onClose?: () => void }) {
  return (
    <div className="field-map-fullscreen-header">
      <div>
        <span className="eyebrow">SEPSA · CAMPO</span>
        <h2>Mapa de órdenes</h2>
      </div>
      <button ref={closeRef} type="button" className="field-map-close" onClick={onClose} aria-label="Cerrar mapa en pantalla completa">
        <span aria-hidden="true">×</span>
        <span>Cerrar mapa</span>
      </button>
    </div>
  );
}

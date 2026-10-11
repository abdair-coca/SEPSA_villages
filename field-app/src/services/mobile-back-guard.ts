/**
 * Guardia del botón atrás en móvil: evita salir de la jornada por un toque accidental pidiendo confirmación.
 * Solo manipula el historial del navegador; qué diálogo se muestra y qué ocurre al confirmar lo decide `App.tsx`.
 */

const MOBILE_BACK_GUARD_KEY = "sepsa-mobile-back-guard";

export interface MobileBackNavigationGuard {
  confirmExit: () => void;
  dispose: () => void;
}

/**
 * En pantallas móviles, intercepta el botón atrás del navegador para pedir confirmación antes de salir
 * (y no perder la jornada por un toque accidental). En escritorio no hace nada.
 */
export function installMobileBackNavigationGuard(target: Window, onRequestExit: () => void): MobileBackNavigationGuard | undefined {
  if (!target.matchMedia("(max-width: 760px)").matches) return undefined;

  const currentState = isRecord(target.history.state) ? target.history.state : {};
  if (!currentState[MOBILE_BACK_GUARD_KEY]) target.history.pushState({ ...currentState, [MOBILE_BACK_GUARD_KEY]: true }, "", target.location.href);

  let released = false;
  const handlePopState = (): void => {
    if (released) return;
    onRequestExit();
    const state = isRecord(target.history.state) ? target.history.state : {};
    target.history.pushState({ ...state, [MOBILE_BACK_GUARD_KEY]: true }, "", target.location.href);
  };
  target.addEventListener("popstate", handlePopState);

  return {
    confirmExit() {
      if (released) return;
      released = true;
      target.history.go(-2);
    },
    dispose() {
      target.removeEventListener("popstate", handlePopState);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

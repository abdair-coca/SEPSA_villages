/** Registra el Service Worker de la PWA (`/sw.js`), que guarda los recursos para abrir la app sin conexión. */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => undefined);
}

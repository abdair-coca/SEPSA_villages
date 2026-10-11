/**
 * Pestaña de mapa del técnico: mapa de órdenes, pantalla completa y descarga de la zona para trabajo offline
 * (`services/map-cache.ts`). No decide la orden activa más allá de la seleccionada o la siguiente prioritaria.
 */
import { useEffect, useState } from "react";
import type { AppStore, AppState } from "../state/store";
import { downloadRouteMap, isRouteMapCached, type CacheProgress } from "../services/map-cache";
import { FieldMap } from "./FieldMap";
import { IconCheck, IconDownload } from "./common/Icons";
import { hasCadastralCoordinates } from "../domain/policies";
import { sortOrdersForNext } from "../utils/sorting";

export function FieldMapPanel({ state, store }: { state: AppState; store: AppStore }) {
  const [isMapCachedState, setIsMapCachedState] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<CacheProgress | null>(null);
  const [isDownloadingMap, setIsDownloadingMap] = useState(false);
  const [mapDownloadError, setMapDownloadError] = useState<string>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const selectedOrderId = state.selectedOrderId ?? sortOrdersForNext(state.orders)[0]?.orderId ?? null;
  const hasMapCoordinates = state.orders.some((order) => hasCadastralCoordinates(order.context));
  useEffect(() => { let active = true; void isRouteMapCached(state.orders).then((cached) => { if (active) setIsMapCachedState(cached); }); return () => { active = false; }; }, [state.orders]);
  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsFullscreen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [isFullscreen]);
  const handleDownloadMap = async () => {
    setIsDownloadingMap(true);
    setMapDownloadError(undefined);
    try { await downloadRouteMap(state.orders, setDownloadProgress); setIsMapCachedState(true); }
    catch (error) { setMapDownloadError(error instanceof Error ? error.message : "No pudimos descargar el mapa para trabajo offline."); }
    finally { setIsDownloadingMap(false); setDownloadProgress(null); }
  };
  return <section className="map-page" aria-label="Mapa de órdenes"><div className="map-page__heading"><div><span className="eyebrow">RUTA DE CAMPO</span><h2>Mapa</h2><p>Ubica tus suministros y abre una ficha desde el mapa.</p></div><span className="map-page__count">{state.orders.length} órdenes</span></div><div className="map-page__surface"><FieldMap orders={state.orders} selectedOrderId={selectedOrderId} onSelectOrder={(orderId) => store.selectOrder(orderId)} mode={state.mode} isFullscreen={isFullscreen} onExpandMap={() => setIsFullscreen(true)} onCloseFullscreen={() => setIsFullscreen(false)} /></div><div className="map-page__tools"><div className="map-page__download">{!isMapCachedState ? <button type="button" className="map-download-link" disabled={isDownloadingMap || !hasMapCoordinates} aria-busy={isDownloadingMap} onClick={() => void handleDownloadMap()}><IconDownload />{isDownloadingMap ? `Descargando zona (${downloadProgress?.percent ?? 0}%)…` : hasMapCoordinates ? "Descargar zona offline" : "No hay coordenadas para descargar"}</button> : <span className="map-cached-tag"><IconCheck /> Mapa descargado</span>}<span className="map-page__download-hint">{isMapCachedState ? "Disponible sin conexión en este dispositivo." : "Guarda esta zona antes de salir a terreno."}</span></div>{mapDownloadError ? <span className="map-page__error" role="alert">{mapDownloadError}</span> : null}</div></section>;
}

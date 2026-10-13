/**
 * Mapa de órdenes (Leaflet, carga diferida) con la ubicación del técnico por GPS, modo pantalla completa y
 * teselas satelitales que pueden quedar en caché para usarse sin conexión (`services/map-cache.ts`).
 * Las órdenes sin coordenadas catastrales válidas no se dibujan; nunca se inventa una ubicación.
 * Las capas y los marcadores de Leaflet viven en `FieldMapLayers.ts`; el encabezado de pantalla completa, en
 * `FieldMapFullscreenHeader.tsx`.
 */
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { ConnectivityMode, WorkOrder } from "../domain/types";
import { hasCadastralCoordinates } from "../domain/policies";
import { FullscreenMapHeader } from "./FieldMapFullscreenHeader";
import { addCachedSatelliteLayer, addOrderMarker } from "./FieldMapLayers";
import {
  IconCrosshair,
  IconExpand,
  IconSignal,
  IconStop,
  IconRoute,
  IconPin,
  IconCheck,
} from "./common/Icons";
import { handleFullscreenMapKeyDown, restoreFullscreenMapFocus } from "../utils/dialog-lifecycle";

interface FieldMapProps {
  orders: WorkOrder[];
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  technicianLocation?: { latitude: number; longitude: number; accuracy?: number };
  mode: ConnectivityMode;
  onLocationUpdate?: (loc: { latitude: number; longitude: number; accuracyMeters: number }) => void;
  compact?: boolean;
  isFullscreen?: boolean;
  onExpandMap?: () => void;
  onCloseFullscreen?: () => void;
}

function orderCoordinates(order: WorkOrder): { lat: number; lng: number } | null {
  const context = order.context;
  if (!context || !hasCadastralCoordinates(context)) return null;
  return { lat: context.cadastralLatitude as number, lng: context.cadastralLongitude as number };
}

export function FieldMap({
  orders,
  selectedOrderId,
  onSelectOrder,
  technicianLocation,
  mode,
  onLocationUpdate,
  compact = false,
  isFullscreen = false,
  onExpandMap,
  onCloseFullscreen,
}: FieldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fullscreenOpenerRef = useRef<HTMLElement | null>(null);
  const onCloseFullscreenRef = useRef(onCloseFullscreen);
  const [mapStatus, setMapStatus] = useState<string>("");
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [liveLocation, setLiveLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);

  const mapInstanceRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const techMarkerRef = useRef<Leaflet.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const fullscreenCloseRef = useRef<HTMLButtonElement>(null);

  const activeLocation = liveLocation ?? technicianLocation ?? null;
  const mappedOrderCount = orders.filter((order) => orderCoordinates(order) !== null).length;
  const hasOrderCoordinates = mappedOrderCount > 0;

  useEffect(() => {
    onCloseFullscreenRef.current = onCloseFullscreen;
  }, [onCloseFullscreen]);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;
    let active = true;

    void (async () => {
      const LModule = await import("leaflet");
      const L = LModule.default ?? LModule;
      await import("leaflet/dist/leaflet.css");
      if (!active || !mapContainerRef.current) return;
      leafletRef.current = L;

      // Extraer coordenadas de las órdenes asignadas
      const orderPoints: Array<{ lat: number; lng: number; order: WorkOrder }> = [];
      orders.forEach((order) => {
        const coordinates = orderCoordinates(order);
        if (coordinates) orderPoints.push({ ...coordinates, order });
      });

      if (!orderPoints.length && !activeLocation) return;

      const initialCenterLat = orderPoints.length > 0
        ? orderPoints.reduce((acc, p) => acc + p.lat, 0) / orderPoints.length
        : activeLocation!.latitude;
      const initialCenterLng = orderPoints.length > 0
        ? orderPoints.reduce((acc, p) => acc + p.lng, 0) / orderPoints.length
        : activeLocation!.longitude;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        minZoom: 11,
        maxZoom: 19,
      }).setView([initialCenterLat, initialCenterLng], 16);

      mapInstanceRef.current = map;

      const satelliteLayer = addCachedSatelliteLayer(L, map);

      satelliteLayer.on("tileerror", () => {
        if (mode === "offline") {
          setMapStatus("Imágenes satelitales no descargadas para este cuadrante. Mostrando referencias vectoriales.");
        }
      });

      if (activeLocation) {
        const isRealGps = liveLocation !== null;
        const techIcon = L.divIcon({
          className: "field-user-marker-wrap",
          html: `<div class="map-user-marker"><div class="user-gps-marker ${isRealGps ? "user-gps-marker--live" : ""}"><div class="user-gps-pulse"></div><div class="user-gps-dot"></div></div><span class="map-user-marker__label">Mi ubicación</span></div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const techMarker = L.marker([activeLocation.latitude, activeLocation.longitude], {
          icon: techIcon,
          title: isRealGps ? "Mi ubicación GPS" : "Ubicación técnica asignada",
        })
          .addTo(map)
          .bindPopup(
            `<strong>${isRealGps ? "Mi ubicación GPS (En vivo)" : "Mi ubicación GPS"}</strong><br>Lat: ${activeLocation.latitude.toFixed(
              6
            )}<br>Lng: ${activeLocation.longitude.toFixed(6)}<br>Precisión: ${
              Math.round(activeLocation.accuracy ?? 0)
            } m`
          );

        techMarkerRef.current = techMarker;
      }

      const ordersBounds = L.latLngBounds([]);

      orderPoints.forEach(({ lat, lng, order }) => {
        addOrderMarker(L, map, order, lat, lng, selectedOrderId, onSelectOrder);
        ordersBounds.extend([lat, lng]);
      });

      if (orderPoints.length > 1) {
        map.fitBounds(ordersBounds.pad(0.18), { maxZoom: 16 });
      } else if (orderPoints.length === 1) {
        map.setView([orderPoints[0].lat, orderPoints[0].lng], 16);
      }
    })();

    return () => {
      active = false;
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      leafletRef.current = null;
    };
  }, [orders, selectedOrderId, onSelectOrder, mode, technicianLocation, Boolean(liveLocation)]);

  // Actualizar marcador de técnico cuando cambie la ubicación en vivo
  useEffect(() => {
    if (!liveLocation || !mapInstanceRef.current || !techMarkerRef.current) return;
    const { latitude, longitude, accuracy } = liveLocation;

    techMarkerRef.current.setLatLng([latitude, longitude]);
    techMarkerRef.current
      .bindPopup(
        `<strong>Mi ubicación GPS ${isTracking ? "(En vivo)" : ""}</strong><br>Lat: ${latitude.toFixed(
          6
        )}<br>Lng: ${longitude.toFixed(6)}<br>Precisión: ${Math.round(accuracy)} m`
      )
      .openPopup();
  }, [liveLocation, isTracking]);

  useEffect(() => {
    if (!isFullscreen || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      mapInstanceRef.current?.invalidateSize({ pan: false });
      fullscreenCloseRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const opener = fullscreenOpenerRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    fullscreenOpenerRef.current = opener;
    const onKeyDown = (event: KeyboardEvent) => handleFullscreenMapKeyDown(event, dialog, onCloseFullscreenRef.current);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreFullscreenMapFocus(opener, dialogRef.current);
      fullscreenOpenerRef.current = null;
    };
  }, [isFullscreen]);

  const handleExpandMap = () => {
    fullscreenOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onExpandMap?.();
  };

  const handleGetRealLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapStatus("Geolocalización no soportada en este navegador o dispositivo.");
      return;
    }

    setIsLocating(true);
    setMapStatus("Consultando señal GPS del dispositivo…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newLoc = { latitude, longitude, accuracy };
        setLiveLocation(newLoc);
        setIsLocating(false);
        setMapStatus(`Ubicación GPS fijada · Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)} · Precisión ${Math.round(accuracy)} m`);

        onLocationUpdate?.({ latitude, longitude, accuracyMeters: accuracy });

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], 17, { animate: true });
        }
      },
      (error) => {
        setIsLocating(false);
        if (error.code === 1) {
          setMapStatus("Permiso de GPS denegado. Habilitá la ubicación en tu navegador.");
        } else if (error.code === 2) {
          setMapStatus("Señal GPS no disponible. Verificá la ubicación de tu dispositivo.");
        } else {
          setMapStatus("Tiempo de espera agotado al consultar GPS.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const toggleLiveTracking = () => {
    if (isTracking) {
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      setMapStatus("Seguimiento continuo desactivado.");
    } else {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setMapStatus("Geolocalización no soportada.");
        return;
      }
      setIsTracking(true);
      setMapStatus("Iniciando seguimiento continuo en tiempo real…");

      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const newLoc = { latitude, longitude, accuracy };
          setLiveLocation(newLoc);
          setMapStatus(`Rastreando en tiempo real · Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`);
          onLocationUpdate?.({ latitude, longitude, accuracyMeters: accuracy });

          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([latitude, longitude], mapInstanceRef.current.getZoom(), { animate: true });
          }
        },
        (error) => {
          setIsTracking(false);
          setMapStatus("Error en seguimiento: " + error.message);
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
      );
      watchIdRef.current = id;
    }
  };

  const fitAllOrders = () => {
    if (!mapInstanceRef.current) return;
    const points: Array<[number, number]> = orders.flatMap((order) => {
      const coordinates = orderCoordinates(order);
      return coordinates ? [[coordinates.lat, coordinates.lng]] : [];
    });

    if (points.length > 0) {
      const L = leafletRef.current;
      if (L) {
        const bounds = L.latLngBounds(points);
        mapInstanceRef.current.fitBounds(bounds.pad(0.18), { maxZoom: 16 });
      }
    } else if (activeLocation) {
      mapInstanceRef.current.setView([activeLocation.latitude, activeLocation.longitude], 16);
    }
  };

  if (!hasOrderCoordinates && !activeLocation) {
    return (
      <div
        ref={dialogRef}
        className={`field-map-container field-map-container--empty${isFullscreen ? " field-map-container--fullscreen" : ""}`}
        role={isFullscreen ? "dialog" : undefined}
        aria-modal={isFullscreen ? true : undefined}
        aria-label="Mapa de la ruta"
        tabIndex={isFullscreen ? -1 : undefined}
      >
        {isFullscreen ? <FullscreenMapHeader closeRef={fullscreenCloseRef} onClose={onCloseFullscreen} /> : null}
        <div className="field-map-empty" role="status">
          <IconPin className="toolbar-icon" />
          <strong>Ubicaciones no disponibles</strong>
          <span>Esta orden no contiene coordenadas operativas. No se mostrará una ubicación estimada.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      className={`field-map-container${compact ? " field-map-container--compact" : ""}${isFullscreen ? " field-map-container--fullscreen" : ""}`}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen ? true : undefined}
      aria-label="Mapa interactivo de la ruta"
      tabIndex={isFullscreen ? -1 : undefined}
    >
      {isFullscreen ? <FullscreenMapHeader closeRef={fullscreenCloseRef} onClose={onCloseFullscreen} /> : null}
      {mapStatus ? (
        <div className="map-warning-banner" role="status">
          {mapStatus}
        </div>
      ) : null}

      <div ref={mapContainerRef} className="field-map-canvas" />

      <div className="field-map-toolbar">
        {!compact ? <div className="field-map-info">
          <span className="field-map-stat">
            <IconPin className="toolbar-icon" /> <strong>{mappedOrderCount}</strong> suministros con ubicación
          </span>
          <span className="field-map-stat">
            <IconCrosshair className="toolbar-icon" /> GPS: <strong>{activeLocation ? `${Math.round(activeLocation.accuracy ?? 0)} m` : "No disponible"}</strong>
          </span>
          {liveLocation ? (
            <span className="real-gps-indicator">
              <IconCheck className="toolbar-icon" /> GPS activo
            </span>
          ) : null}
        </div> : null}

        <div className="field-map-buttons">
          <button
            type="button"
            className={`btn-center-map ${liveLocation ? "btn-center-map--active" : ""}`}
            onClick={handleGetRealLocation}
            disabled={isLocating}
            title="Centrar en mi ubicación GPS"
          >
            <IconCrosshair className="btn-icon" />
            <span>{isLocating ? "Obteniendo GPS…" : "Mi ubicación"}</span>
          </button>

          <button
            type="button"
            className={`btn-tracking ${isTracking ? "btn-tracking--active" : ""}`}
            onClick={toggleLiveTracking}
            title="Seguimiento GPS continuo en mapa"
          >
            {isTracking ? <IconStop className="btn-icon" /> : <IconSignal className="btn-icon" />}
            <span>{isTracking ? "Detener" : "Rastrear"}</span>
          </button>

          <button
            type="button"
            className="btn-fit-orders"
            onClick={fitAllOrders}
            title="Enfocar la zona donde están todas las órdenes"
          >
            <IconRoute className="btn-icon" />
            <span>Zona de órdenes</span>
          </button>

          {!compact && !isFullscreen && onExpandMap ? (
            <button type="button" className="btn-expand-map" onClick={handleExpandMap} aria-label="Expandir mapa a pantalla completa">
              <IconExpand className="btn-icon" />
              <span>Expandir mapa</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="field-map-legend" role="group" aria-label="Leyenda del mapa">
        <span><i className="field-map-legend__dot field-map-legend__dot--order" />Orden de corte</span>
        <span><i className="field-map-legend__dot field-map-legend__dot--location" />Mi ubicación</span>
      </div>
    </div>
  );
}

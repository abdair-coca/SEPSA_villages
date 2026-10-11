/**
 * Capas y marcadores de Leaflet para `FieldMap`: capa satelital que consulta primero la caché local de teselas
 * (para usar el mapa sin conexión) y marcadores de órdenes con su popup. No decide qué órdenes se dibujan ni
 * calcula coordenadas: `FieldMap` entrega cada punto ya validado.
 */
import type * as Leaflet from "leaflet";
import type { WorkOrder } from "../domain/types";
import { MAP_CACHE_NAME, SATELLITE_TILE_URL_TEMPLATE } from "../services/map-cache";
import { escapeHtml, orderPopupHtml } from "../utils/format";

type LeafletLib = typeof import("leaflet");

/** Agrega al mapa la capa satelital con caché offline y la devuelve para enganchar sus eventos. */
export function addCachedSatelliteLayer(L: LeafletLib, map: Leaflet.Map): Leaflet.TileLayer {
  class CachedSatelliteLayer extends L.TileLayer {
    override createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback): HTMLImageElement {
      const tile = document.createElement("img");
      const url = this.getTileUrl(coords);
      tile.alt = "";
      tile.setAttribute("role", "presentation");

      if (typeof caches !== "undefined") {
        caches
          .open(MAP_CACHE_NAME)
          .then((cache) => cache.match(url))
          .then((response) => {
            if (response) {
              return response.blob().then((blob) => {
                tile.src = URL.createObjectURL(blob);
                done(undefined, tile);
              });
            }
            tile.src = url;
            L.DomEvent.on(tile, "load", () => done(undefined, tile));
            L.DomEvent.on(tile, "error", () => done(new Error("Satellite tile failed to load"), tile));
          })
          .catch(() => {
            tile.src = url;
            L.DomEvent.on(tile, "load", () => done(undefined, tile));
            L.DomEvent.on(tile, "error", () => done(new Error("Satellite tile failed to load"), tile));
          });
      } else {
        tile.src = url;
        L.DomEvent.on(tile, "load", () => done(undefined, tile));
        L.DomEvent.on(tile, "error", () => done(new Error("Satellite tile failed to load"), tile));
      }

      return tile;
    }
  }

  const satelliteLayer = new CachedSatelliteLayer(SATELLITE_TILE_URL_TEMPLATE, {
    maxNativeZoom: 17,
    maxZoom: 19,
    attribution: "Tiles &copy; Esri",
  }).addTo(map);
  return satelliteLayer;
}

/** Dibuja el marcador de una orden con su popup ("Ver ficha de corte" selecciona la orden). */
export function addOrderMarker(L: LeafletLib, map: Leaflet.Map, order: WorkOrder, lat: number, lng: number, selectedOrderId: string | null, onSelectOrder: (orderId: string) => void): void {
  const isCancelled = order.status === "ANULADO";
  const isExecuted = order.status === "EJECUTADO";
  const isSelected = order.orderId === selectedOrderId;

  const markerColor = isCancelled ? "#64748b" : isExecuted ? "#16a34a" : "#e85d04";

  const debtCents = order.context?.debtCents;
  const debt = typeof debtCents === "number" ? `Bs ${(debtCents / 100).toFixed(2)}` : "Dato no disponible";
  const account = order.context?.accountId || order.accountId || "S/C";
  const meter = order.context?.meterId || "S/M";
  const customer = order.context?.customerName || order.orderId;
  const markerTone = isCancelled ? "muted" : isExecuted ? "done" : "pending";
  const marker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: "map-order-marker-wrap",
      html: `<div class="map-order-marker map-order-marker--${markerTone}${isSelected ? " map-order-marker--selected" : ""}"><span class="map-order-marker__dot" style="background:${markerColor}"></span><span class="map-order-marker__label">${escapeHtml(customer)}</span></div>`,
      iconSize: [0, 0],
      iconAnchor: [7, 7],
    }),
    title: customer,
  }).addTo(map);

  const popupContent = document.createElement("div");
  popupContent.className = "map-popup";
  popupContent.innerHTML = orderPopupHtml(account, customer, meter, debt, order.status);

  const viewBtn = document.createElement("button");
  viewBtn.className = "btn-map-popup";
  viewBtn.textContent = "Ver ficha de corte";
  viewBtn.onclick = () => {
    onSelectOrder(order.orderId);
  };
  popupContent.appendChild(viewBtn);

  marker.bindPopup(popupContent);
}

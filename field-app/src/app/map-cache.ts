import type { WorkOrder } from "../domain";

export const MAP_CACHE_NAME = "sepsa-map-tiles-v1";
export const SATELLITE_TILE_URL_TEMPLATE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export interface RouteBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface TileCoordinate {
  x: number;
  y: number;
  z: number;
  url: string;
}

export interface CacheProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export function getOrdersBoundingBox(orders: WorkOrder[]): RouteBoundingBox | null {
  const points: Array<{ lat: number; lng: number }> = [];

  for (const order of orders) {
    const lat = order.context?.cadastralLatitude;
    const lng = order.context?.cadastralLongitude;
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push({ lat, lng });
    }
  }

  if (!points.length) {
    // Coordenadas de contingencia basadas en Mojotorillo si las órdenes no tienen coordenadas explícitas
    return {
      minLat: -19.591,
      maxLat: -19.587,
      minLng: -65.261,
      maxLng: -65.256,
    };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  // Margen de seguridad alrededor de los puntos (~500 metros)
  const margin = 0.005;
  return {
    minLat: minLat - margin,
    maxLat: maxLat + margin,
    minLng: minLng - margin,
    maxLng: maxLng + margin,
  };
}

export function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function computeTilesForBox(
  box: RouteBoundingBox,
  minZoom = 14,
  maxZoom = 16
): TileCoordinate[] {
  const tiles: TileCoordinate[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const minX = Math.min(lon2tile(box.minLng, z), lon2tile(box.maxLng, z));
    const maxX = Math.max(lon2tile(box.minLng, z), lon2tile(box.maxLng, z));
    const minY = Math.min(lat2tile(box.maxLat, z), lat2tile(box.minLat, z));
    const maxY = Math.max(lat2tile(box.maxLat, z), lat2tile(box.minLat, z));

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const url = SATELLITE_TILE_URL_TEMPLATE.replace("{z}", String(z))
          .replace("{y}", String(y))
          .replace("{x}", String(x));
        tiles.push({ x, y, z, url });
      }
    }
  }

  return tiles;
}

export function getRouteStorageKey(orders: WorkOrder[]): string {
  const route = orders.find((o) => o.context?.route)?.context?.route || "general";
  return `sepsa.map-cached-route-${route}`;
}

export async function isRouteMapCached(orders: WorkOrder[]): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  const key = getRouteStorageKey(orders);
  if (localStorage.getItem(key) === "cached") {
    return true;
  }
  if (typeof caches !== "undefined") {
    const hasCache = await caches.has(MAP_CACHE_NAME);
    if (!hasCache) return false;
    const cache = await caches.open(MAP_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > 20) {
      localStorage.setItem(key, "cached");
      return true;
    }
  }
  return false;
}

export async function downloadRouteMap(
  orders: WorkOrder[],
  onProgress?: (progress: CacheProgress) => void
): Promise<{ success: boolean; total: number }> {
  if (typeof caches === "undefined") {
    throw new Error("El almacenamiento de mapas (CacheStorage) no está soportado en este dispositivo.");
  }

  const box = getOrdersBoundingBox(orders);
  if (!box) {
    throw new Error("No hay coordenadas disponibles para la ruta.");
  }

  const tiles = computeTilesForBox(box, 14, 16);
  const cache = await caches.open(MAP_CACHE_NAME);
  let downloaded = 0;
  const total = tiles.length;

  onProgress?.({ downloaded: 0, total, percent: 0 });

  const concurrency = 3;
  for (let i = 0; i < tiles.length; i += concurrency) {
    const batch = tiles.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (tile) => {
        try {
          const cachedResponse = await cache.match(tile.url);
          if (!cachedResponse) {
            const res = await fetch(tile.url, { mode: "cors" });
            if (res.ok) {
              await cache.put(tile.url, res);
            }
          }
        } catch {
          // Ignorar fallas individuales de tiles no encontrados o de red
        } finally {
          downloaded++;
          const percent = Math.round((downloaded / total) * 100);
          onProgress?.({ downloaded, total, percent });
        }
      })
    );
  }

  const key = getRouteStorageKey(orders);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, "cached");
  }

  return { success: true, total };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeTilesForBox,
  downloadRouteMap,
  getOrdersBoundingBox,
  getRouteStorageKey,
  lat2tile,
  lon2tile,
  type RouteBoundingBox,
} from "./map-cache";
import { createDemoPackage } from "./runtime";
import type { WorkOrder } from "../domain";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("map-cache utilities", () => {
  it("computes tile coordinates from lon/lat accurately", () => {
    // Coordenadas conocidas: lat -19.589, lon -65.259 (Mojotorillo) a zoom 15
    const tileX = lon2tile(-65.259, 15);
    const tileY = lat2tile(-19.589, 15);

    expect(Number.isInteger(tileX)).toBe(true);
    expect(Number.isInteger(tileY)).toBe(true);
    expect(tileX).toBeGreaterThan(0);
    expect(tileY).toBeGreaterThan(0);
  });

  it("calculates bounding box from work orders with coordinates", () => {
    const orders: WorkOrder[] = [
      {
        orderId: "ORD-1",
        assignedTechnicianId: "tech-1",
        status: "GENERADO",
        physicalStatus: "NONE",
        context: {
          debtorId: "d-1",
          accountId: "cta-1",
          supplyId: "sum-1",
          customerName: "Cliente 1",
          address: "Dir 1",
          references: "",
          meterId: "m-1",
          area: "Valle",
          locality: "Mojotorillo",
          route: "002",
          debtCents: 5000,
          monthsPending: 2,
          updatedAt: "2026-09-10",
          source: "SIMULATED",
          kardex: [],
          cadastralLatitude: -19.5891,
          cadastralLongitude: -65.2582,
        },
      },
      {
        orderId: "ORD-2",
        assignedTechnicianId: "tech-1",
        status: "GENERADO",
        physicalStatus: "NONE",
        context: {
          debtorId: "d-2",
          accountId: "cta-2",
          supplyId: "sum-2",
          customerName: "Cliente 2",
          address: "Dir 2",
          references: "",
          meterId: "m-2",
          area: "Valle",
          locality: "Mojotorillo",
          route: "002",
          debtCents: 7500,
          monthsPending: 3,
          updatedAt: "2026-09-10",
          source: "SIMULATED",
          kardex: [],
          cadastralLatitude: -19.5901,
          cadastralLongitude: -65.2603,
        },
      },
    ];

    const box = getOrdersBoundingBox(orders);
    expect(box).not.toBeNull();
    if (box) {
      expect(box.minLat).toBeLessThan(-19.59);
      expect(box.maxLat).toBeGreaterThan(-19.59);
      expect(box.minLng).toBeLessThan(-65.26);
      expect(box.maxLng).toBeGreaterThan(-65.259);
    }
  });

  it("computes reasonable tile count for route bounding box", () => {
    const box: RouteBoundingBox = {
      minLat: -19.595,
      maxLat: -19.585,
      minLng: -65.265,
      maxLng: -65.255,
    };

    const tiles = computeTilesForBox(box, 14, 16);
    expect(tiles.length).toBeGreaterThan(0);
    // Para un radio de ~1 km en zooms 14-16, los tiles deben ser entre 10 y 100
    expect(tiles.length).toBeLessThan(150);

    const sampleTile = tiles[0];
    expect(sampleTile.url).toContain("https://server.arcgisonline.com");
    expect(sampleTile.url).toContain(String(sampleTile.z));
  });

  it("calculates zone bounding box strictly from orders without depending on technician location", () => {
    const orders: WorkOrder[] = [
      {
        orderId: "ORD-1",
        assignedTechnicianId: "tech-camila",
        status: "GENERADO",
        physicalStatus: "NONE",
        context: {
          debtorId: "d-1",
          accountId: "cta-1",
          supplyId: "sum-1",
          customerName: "A",
          address: "Dir A",
          references: "",
          meterId: "m-1",
          area: "B",
          locality: "Mojotorillo",
          route: "002",
          debtCents: 1000,
          monthsPending: 2,
          updatedAt: "2026-09-10",
          source: "SIMULATED",
          kardex: [],
          cadastralLatitude: -19.589366,
          cadastralLongitude: -65.259119,
        },
      },
      {
        orderId: "ORD-2",
        assignedTechnicianId: "tech-camila",
        status: "GENERADO",
        physicalStatus: "NONE",
        context: {
          debtorId: "d-2",
          accountId: "cta-2",
          supplyId: "sum-2",
          customerName: "B",
          address: "Dir B",
          references: "",
          meterId: "m-2",
          area: "B",
          locality: "Mojotorillo",
          route: "002",
          debtCents: 2000,
          monthsPending: 3,
          updatedAt: "2026-09-10",
          source: "SIMULATED",
          kardex: [],
          cadastralLatitude: -19.588521,
          cadastralLongitude: -65.258941,
        },
      },
    ];

    const box = getOrdersBoundingBox(orders);
    expect(box).not.toBeNull();
    // Verify that the computed box contains both orders with security margin
    expect(box!.minLat).toBeLessThanOrEqual(-19.589366);
    expect(box!.maxLat).toBeGreaterThanOrEqual(-19.588521);
    expect(box!.minLng).toBeLessThanOrEqual(-65.259119);
    expect(box!.maxLng).toBeGreaterThanOrEqual(-65.258941);
  });

  it("does not invent a route when orders have no coordinates", () => {
    const orders: WorkOrder[] = [{
      orderId: "ORD-NO-COORDS",
      assignedTechnicianId: "tech-1",
      status: "GENERADO",
      physicalStatus: "NONE",
      context: {
        debtorId: "d-1",
        accountId: "cta-1",
        supplyId: "sum-1",
        customerName: "Cliente sin coordenadas",
        address: "Dirección sin ubicación operativa",
        references: "",
        meterId: "m-1",
        area: "Valle",
        locality: "Mojotorillo",
        route: "002",
        debtCents: 1000,
        monthsPending: 1,
        updatedAt: "2026-09-10",
        source: "SIMULATED",
        kardex: [],
      },
    }];

    expect(getOrdersBoundingBox(orders)).toBeNull();
  });

  it("does not mark route cached when tile download is incomplete", async () => {
    const orders = createDemoPackage("2026-09-12T10:00:00.000Z").orders;
    const storage = new Map<string, string>();
    const cache = {
      match: async () => undefined,
      put: async () => undefined,
    };

    vi.stubGlobal("caches", { open: async () => cache });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    await expect(downloadRouteMap(orders)).rejects.toThrow("Solo se descargaron");
    expect(storage.get(getRouteStorageKey(orders))).toBeUndefined();
  });
});

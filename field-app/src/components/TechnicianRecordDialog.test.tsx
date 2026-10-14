import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TechnicianRecordEntry } from "../domain/types";
import { TechnicianRecordBody, TechnicianRecordDialog } from "./TechnicianRecordDialog";

const cut: TechnicianRecordEntry = {
  operationId: "cut-00000000-0000-4000-8000-000000000001",
  orderId: "order-1",
  action: "CUT",
  status: "acknowledged",
  deviceId: "device-a-000000000000000000",
  recordedAt: "2026-10-01T10:00:02.000Z",
  createdAt: "2026-10-01T10:00:02.500Z",
  acknowledgedAt: "2026-10-01T10:00:03.000Z",
  orderVersion: 3,
  evidenceRefs: ["evidence-1"],
  fieldCapture: {
    reading: { status: "CAPTURED", value: 1520.5, meterId: "MTR-RECORD", unit: "kWh", recordedAt: "2026-10-01T10:00:00.000Z" },
    location: { status: "CAPTURED", latitude: 14.6, longitude: -90.5, accuracyMeters: 8, recordedAt: "2026-10-01T10:00:01.000Z" },
    cutType: "MEDIDOR",
    nearbyMeters: false,
  },
};

/** Las pruebas de HTML no ejecutan efectos: ninguna foto debe pedirse al renderizar. */
const noPhoto = async (): Promise<never> => { throw new Error("no debe pedirse al renderizar"); };

const visitWithConflict: TechnicianRecordEntry = {
  operationId: "visit-00000000-0000-4000-8000-000000000002",
  orderId: "order-1",
  action: "VISIT",
  status: "conflict",
  deviceId: "device-b",
  createdAt: "2026-10-01T11:00:00.000Z",
  conflictReason: "La versión de la orden está desactualizada.",
  reason: "Cliente ausente",
  evidenceRefs: [],
};

describe("TechnicianRecordBody", () => {
  it("shows the loading state while the server answers", () => {
    const html = renderToStaticMarkup(<TechnicianRecordBody state={{ status: "loading" }} onRetry={() => undefined} readEvidence={noPhoto} />);
    expect(html).toContain("Consultando el servidor");
    expect(html).not.toContain("Reintentar");
  });

  it("offers a retry and states that nothing changed on this device when the query fails", () => {
    const html = renderToStaticMarkup(<TechnicianRecordBody state={{ status: "error" }} onRetry={() => undefined} readEvidence={noPhoto} />);
    expect(html).toContain("No pudimos cargar el registro");
    expect(html).toContain("No se cambió nada en este dispositivo");
    expect(html).toContain("Reintentar");
  });

  it("explains an empty record without offering any change", () => {
    const html = renderToStaticMarkup(<TechnicianRecordBody state={{ status: "ready", entries: [] }} onRetry={() => undefined} readEvidence={noPhoto} />);
    expect(html).toContain("Sin registros en el servidor");
    expect(html).not.toContain("<button");
  });

  it("lists the server record with its status, capture and evidence count, read-only", () => {
    const html = renderToStaticMarkup(<TechnicianRecordBody state={{ status: "ready", entries: [cut, visitWithConflict] }} onRetry={() => undefined} readEvidence={noPhoto} />);
    expect(html).toContain("Solo lectura.");
    expect(html).toContain("Corte");
    expect(html).toContain("Confirmado por el servidor");
    expect(html).toContain("1520.5 kWh");
    expect(html).toContain("MTR-RECORD");
    expect(html).toContain("14.600000, -90.500000 · ±8 m");
    expect(html).toContain("Medidor");
    expect(html).toContain("Evidencias registradas");
    expect(html).toContain("Visita");
    expect(html).toContain("Conflicto en el servidor");
    expect(html).toContain("Motivo del conflicto: La versión de la orden está desactualizada.");
    expect(html).toContain("Cliente ausente");
    // Solo la foto de la visita con evidencia es un botón; el resto de la lista es solo lectura.
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("offers each server photo as a button that downloads nothing until pressed", () => {
    const html = renderToStaticMarkup(<TechnicianRecordBody state={{ status: "ready", entries: [cut] }} onRetry={() => undefined} readEvidence={noPhoto} />);
    expect(html).toContain("Ver foto 1");
    expect(html).toContain("Evidencias registradas");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Cargando");
  });

  it("reports a capture exception instead of inventing coordinates", () => {
    const bypassed: TechnicianRecordEntry = {
      ...cut,
      fieldCapture: {
        ...cut.fieldCapture!,
        reading: { status: "UNAVAILABLE", meterId: "MTR-RECORD", unit: "kWh", recordedAt: "2026-10-01T10:00:00.000Z", exceptionReason: "medidor_inaccesible" },
        location: { status: "BYPASSED", recordedAt: "2026-10-01T10:00:01.000Z", exceptionReason: "saltar_control_coordenadas: sin señal" },
      },
    };
    const html = renderToStaticMarkup(<TechnicianRecordBody state={{ status: "ready", entries: [bypassed] }} onRetry={() => undefined} readEvidence={noPhoto} />);
    expect(html).toContain("Sin lectura (medidor_inaccesible)");
    expect(html).toContain("Excepción: saltar_control_coordenadas: sin señal");
    expect(html).not.toContain("14.600000");
  });
});

describe("TechnicianRecordDialog", () => {
  it("opens in the loading state with the order and the server-record title", () => {
    const html = renderToStaticMarkup(<TechnicianRecordDialog orderId="order-1234567890abcdef" source={{ listOrder: async () => [], readEvidence: noPhoto }} onClose={() => undefined} />);
    expect(html).toContain("Registro del servidor");
    expect(html).toContain("Consultando el servidor");
    expect(html).toContain('role="dialog"');
  });
});

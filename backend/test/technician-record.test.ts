import test from "node:test";
import assert from "node:assert/strict";
import { toTechnicianRecordEntry } from "../src/mappers/technician-record.mapper.js";
import type { TechnicianRecordRow } from "../src/repositories/technician-record.repository.js";

const fieldCapture = {
  reading: { status: "CAPTURED", value: 1520.5, meterId: "MTR-1", unit: "kWh", recordedAt: "2026-10-01T10:00:00.000Z" },
  location: { status: "CAPTURED", latitude: 14.6, longitude: -90.5, accuracyMeters: 8, recordedAt: "2026-10-01T10:00:01.000Z" },
  cutType: "MEDIDOR",
  nearbyMeters: false,
};

function row(overrides: Partial<TechnicianRecordRow> = {}): TechnicianRecordRow {
  return {
    operation_id: "op-cut-1",
    order_id: "00000000-0000-4000-8000-000000000001",
    action: "CUT",
    status: "acknowledged",
    device_id: "device-a",
    payload: {
      operation_id: "op-cut-1",
      recorded_at: "2026-10-01T10:00:02.000Z",
      order_version: 3,
      evidence_refs: ["ev-1"],
      field_capture: fieldCapture,
      authorization_id: "auth-1",
      authorization_token: "secret-token-must-not-leave",
    },
    conflict_reason: null,
    acknowledged_at: new Date("2026-10-01T10:00:03.000Z"),
    created_at: new Date("2026-10-01T10:00:02.500Z"),
    ...overrides,
  };
}

test("el registro expone la captura y las fechas del técnico", () => {
  const entry = toTechnicianRecordEntry(row());
  assert.equal(entry.operation_id, "op-cut-1");
  assert.equal(entry.action, "CUT");
  assert.equal(entry.status, "acknowledged");
  assert.equal(entry.device_id, "device-a");
  assert.equal(entry.recorded_at, "2026-10-01T10:00:02.000Z");
  assert.equal(entry.created_at, "2026-10-01T10:00:02.500Z");
  assert.equal(entry.acknowledged_at, "2026-10-01T10:00:03.000Z");
  assert.equal(entry.order_version, 3);
  assert.deepEqual(entry.evidence_refs, ["ev-1"]);
  assert.deepEqual(entry.field_capture, fieldCapture);
});

test("el token de autorización nunca sale, aunque esté en el payload guardado", () => {
  const entry = toTechnicianRecordEntry(row());
  assert.equal(JSON.stringify(entry).includes("secret-token-must-not-leave"), false);
  assert.equal("authorization_token" in entry, false);
  assert.equal("authorization_id" in entry, false);
});

test("los campos ausentes o con tipo inválido salen como null o lista vacía, sin inventar valores", () => {
  const entry = toTechnicianRecordEntry(row({
    action: "VISIT",
    payload: { recorded_at: 42, order_version: 1.5, evidence_refs: ["ok", 7], field_capture: "no-es-objeto", reason: "Sin acceso" },
    acknowledged_at: null,
    conflict_reason: "Versión distinta",
    status: "conflict",
  }));
  assert.equal(entry.recorded_at, null);
  assert.equal(entry.order_version, null);
  assert.deepEqual(entry.evidence_refs, []);
  assert.equal(entry.field_capture, null);
  assert.equal(entry.reason, "Sin acceso");
  assert.equal(entry.acknowledged_at, null);
  assert.equal(entry.conflict_reason, "Versión distinta");
});

test("las fechas en texto se normalizan a ISO", () => {
  const entry = toTechnicianRecordEntry(row({ created_at: "2026-10-01T10:00:02.500Z", acknowledged_at: "2026-10-01T10:00:03Z" }));
  assert.equal(entry.created_at, "2026-10-01T10:00:02.500Z");
  assert.equal(entry.acknowledged_at, "2026-10-01T10:00:03.000Z");
});

/**
 * Registro de una orden que el servidor tiene del técnico, en solo lectura: lo que llegó desde cualquier
 * dispositivo. No muestra la cola local ni cambia nada; las consultas quedan auditadas en el servidor. Las fotos
 * se piden una a una, al pulsar, y solo se muestran si sus bytes coinciden con el hash guardado.
 */
import { useCallback, useEffect, useState } from "react";
import type { CutType, FieldCapture, TechnicianEvidenceImage, TechnicianRecordEntry } from "../domain/types";
import type { ServerRecordSource } from "../ports/technician-record";
import { formatDate, shortTechnicalId } from "../utils/format";
import { AppModal } from "./common/Modal";
import { AppStateCard } from "./common/UiState";

export type RecordState =
  | { status: "loading" }
  | { status: "ready"; entries: TechnicianRecordEntry[] }
  | { status: "error" };

const ACTION_LABEL: Record<TechnicianRecordEntry["action"], string> = { CUT: "Corte", VISIT: "Visita", RECONNECTION: "Reconexión" };
const STATUS_LABEL: Record<TechnicianRecordEntry["status"], string> = {
  acknowledged: "Confirmado por el servidor",
  pending: "Pendiente en el servidor",
  conflict: "Conflicto en el servidor",
};
const CUT_TYPE_LABEL: Record<CutType, string> = { RED: "Red", MEDIDOR: "Medidor", BARRAS: "Barras", PROTECCION: "Protección", ACOMETIDA: "Acometida", FUSIBLES: "Fusibles" };

export function TechnicianRecordDialog({ orderId, source, onClose }: { orderId: string; source: ServerRecordSource; onClose: () => void }) {
  const [state, setState] = useState<RecordState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    source.listOrder(orderId).then(
      (entries) => { if (active) setState({ status: "ready", entries }); },
      () => { if (active) setState({ status: "error" }); },
    );
    return () => { active = false; };
  }, [source, orderId, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return (
    <AppModal titleId="technician-record-title" eyebrow="Registro del servidor" title={`Orden ${shortTechnicalId(orderId)}`} onClose={onClose} describedBy="technician-record-intro">
      <TechnicianRecordBody state={state} onRetry={retry} readEvidence={source.readEvidence} />
    </AppModal>
  );
}

/** Contenido del registro según el estado de la consulta; sin efectos, para poder probarlo como HTML. */
export function TechnicianRecordBody({ state, onRetry, readEvidence }: { state: RecordState; onRetry: () => void; readEvidence: (evidenceId: string) => Promise<TechnicianEvidenceImage> }) {
  return (
    <>
      <p id="technician-record-intro" className="admin-modal__intro">Solo lectura. Muestra lo que llegó al servidor desde cualquier dispositivo. Lo que aún no se sincronizó sigue en Pendientes de este dispositivo.</p>
      {state.status === "loading" ? <AppStateCard tone="loading" title="Consultando el servidor" description="Esperando el registro de esta orden." /> : null}
      {state.status === "error" ? <AppStateCard tone="error" title="No pudimos cargar el registro" description="No se cambió nada en este dispositivo. Intente de nuevo cuando haya conexión." action={{ label: "Reintentar", onClick: onRetry }} /> : null}
      {state.status === "ready" && state.entries.length === 0 ? <AppStateCard tone="empty" layout="inline" title="Sin registros en el servidor" description="El servidor todavía no tiene operaciones de esta orden de este técnico." /> : null}
      {state.status === "ready" && state.entries.length > 0 ? (
        <div className="activity-entry-list">
          {state.entries.map((entry) => <RecordEntry key={entry.operationId} entry={entry} readEvidence={readEvidence} />)}
        </div>
      ) : null}
    </>
  );
}

function RecordEntry({ entry, readEvidence }: { entry: TechnicianRecordEntry; readEvidence: (evidenceId: string) => Promise<TechnicianEvidenceImage> }) {
  const recordedAt = entry.recordedAt ?? entry.createdAt;
  return (
    <article className="activity-entry">
      <div className="activity-entry__top">
        <strong>{ACTION_LABEL[entry.action]}</strong>
        <span>{STATUS_LABEL[entry.status]}</span>
      </div>
      <p><time dateTime={recordedAt}>{formatDate(recordedAt)}</time> · Dispositivo {shortTechnicalId(entry.deviceId)}</p>
      <dl className="context-grid">
        {detailRows(entry).map((row) => <div className="data-point" key={row.label}><dt><span>{row.label}</span></dt><dd><strong>{row.value}</strong></dd></div>)}
      </dl>
      {entry.conflictReason ? <div className="exception-meta">Motivo del conflicto: {entry.conflictReason}</div> : null}
      {entry.fieldCapture ? <dl className="context-grid">{captureRows(entry.fieldCapture).map((row) => <div className="data-point" key={row.label}><dt><span>{row.label}</span></dt><dd><strong>{row.value}</strong></dd></div>)}</dl> : null}
      {entry.evidenceRefs.length ? (
        <div className="evidence-list">
          {entry.evidenceRefs.map((evidenceId, index) => <EvidenceThumbnail key={evidenceId} label={`Foto ${index + 1}`} evidenceId={evidenceId} readEvidence={readEvidence} />)}
        </div>
      ) : null}
    </article>
  );
}

type PhotoState = { status: "idle" } | { status: "loading" } | { status: "ready"; image: TechnicianEvidenceImage } | { status: "error" };

/** Foto bajo demanda: no se descarga hasta que el técnico la pide, y un fallo no bloquea el resto del registro. */
function EvidenceThumbnail({ evidenceId, label, readEvidence }: { evidenceId: string; label: string; readEvidence: (evidenceId: string) => Promise<TechnicianEvidenceImage> }) {
  const [photo, setPhoto] = useState<PhotoState>({ status: "idle" });
  const load = () => {
    setPhoto({ status: "loading" });
    readEvidence(evidenceId).then(
      (image) => setPhoto({ status: "ready", image }),
      () => setPhoto({ status: "error" }),
    );
  };

  if (photo.status === "ready") {
    return <figure className="technician-record__photo"><img src={photo.image.dataUrl} alt={`${label} de la visita, desde el servidor`} /><figcaption>{label}</figcaption></figure>;
  }
  if (photo.status === "loading") return <span role="status">Cargando {label.toLowerCase()}…</span>;
  if (photo.status === "error") {
    return <span role="alert">No se pudo cargar {label.toLowerCase()}. <button type="button" className="secondary-action" onClick={load}>Reintentar</button></span>;
  }
  return <button type="button" className="secondary-action" onClick={load}>Ver {label.toLowerCase()}</button>;
}

function detailRows(entry: TechnicianRecordEntry): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string | undefined }> = [
    { label: "Versión de la orden", value: entry.orderVersion === undefined ? undefined : String(entry.orderVersion) },
    { label: "Vigente desde", value: entry.effectiveAt === undefined ? undefined : formatDate(entry.effectiveAt) },
    { label: "Demora", value: entry.demora },
    { label: "Técnico registrado", value: entry.technicianNameSnapshot },
    { label: "Motivo", value: entry.reason },
    { label: "Excepción", value: entry.exceptionReason },
    { label: "Confirmado", value: entry.acknowledgedAt === undefined ? undefined : formatDate(entry.acknowledgedAt) },
    { label: "Evidencias registradas", value: String(entry.evidenceRefs.length) },
  ];
  return rows.filter((row): row is { label: string; value: string } => row.value !== undefined);
}

function captureRows(capture: FieldCapture): Array<{ label: string; value: string }> {
  const { reading, location } = capture;
  const readingValue = reading.status === "CAPTURED" && reading.value !== undefined ? `${reading.value} kWh` : `Sin lectura${reading.exceptionReason ? ` (${reading.exceptionReason})` : ""}`;
  const locationValue = location.status === "CAPTURED" && location.latitude !== undefined && location.longitude !== undefined
    ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} · ±${Math.round(location.accuracyMeters ?? 0)} m`
    : location.status === "BYPASSED" ? `Excepción: ${location.exceptionReason ?? "sin motivo"}` : "No disponible";
  return [
    { label: "Lectura final", value: readingValue },
    { label: "Medidor", value: reading.meterId },
    { label: "Ubicación", value: locationValue },
    { label: "Tipo de corte", value: CUT_TYPE_LABEL[capture.cutType] },
    { label: "Medidores cercanos", value: capture.nearbyMeters ? "Sí" : "No" },
  ];
}

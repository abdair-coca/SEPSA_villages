import { useEffect, useRef, useState } from "react";
import type { ActionInput, ActionKind, AppStore } from "../state/store";
import type { CutType, FieldCapture, WorkOrder } from "../domain/types";
import type { CaptureDraftContent } from "../ports/repository";
import { createCaptureGpsRequest } from "../services/capture-gps-request";
import { actionLabel } from "../utils/field-app-utils";

export type CaptureWizardStep = "reading" | "cutSettings" | "gps" | "gpsException" | "evidence" | "evidenceException" | "review";
export type CaptureDraftLoadResult = { status: "ready"; content: CaptureDraftContent } | { status: "error" };

export function captureWizardSteps(kind: ActionKind, gpsException: boolean, photoException: boolean): CaptureWizardStep[] {
  return (kind === "CUT"
    ? ["reading", "cutSettings", "gps", ...(gpsException ? ["gpsException"] : []), "evidence", ...(photoException ? ["evidenceException"] : []), "review"]
    : ["evidence", ...(photoException ? ["evidenceException"] : []), "review"]) as CaptureWizardStep[];
}

export async function loadCaptureDraftSafely(load: () => Promise<CaptureDraftContent | undefined>): Promise<CaptureDraftLoadResult> {
  try { return { status: "ready", content: await load() ?? {} }; }
  catch { return { status: "error" }; }
}

export function captureDraftCanAdvance(status: CaptureDraftLoadResult["status"] | "loading"): boolean {
  return status === "ready";
}

export function captureSubmitError(error: unknown): { message: string; verificationUncertain: boolean } {
  const verificationUncertain = error instanceof Error && error.message.includes("No pudimos verificar el guardado local");
  return {
    verificationUncertain,
    message: verificationUncertain
      ? "No pudimos confirmar si la operación quedó guardada en este dispositivo. Revisa las operaciones pendientes antes de reintentar."
      : "No pudimos guardar la operación. Revisa el estado de la orden y las operaciones pendientes antes de reintentar.",
  };
}

export function EvidencePicker({ file, onSelect, onInvalid }: { file?: File; onSelect: (file: File) => void; onInvalid: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="file-field">
      <span>Archivo de evidencia</span>
      <input ref={input} className="file-field__input" type="file" tabIndex={-1} aria-hidden="true" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (selected.type === "image/jpeg" || selected.type === "image/png") onSelect(selected);
        else onInvalid();
      }} />
      <button type="button" className="secondary-action file-field__choose" aria-label="Elegir foto de evidencia" onClick={() => input.current?.click()}>Elegir foto</button>
      <small aria-live="polite">{file?.name ?? "JPEG o PNG preparado"}</small>
    </div>
  );
}

export function CaptureForm({
  kind,
  order,
  store,
  technicianName,
  busy,
  blocked,
  onCancel,
  onSubmit,
}: {
  kind: ActionKind;
  order: WorkOrder;
  store: AppStore;
  technicianName?: string;
  busy: boolean;
  blocked: boolean;
  onCancel: () => void;
  onSubmit: (input: ActionInput) => Promise<boolean>;
}) {
  const [content, setContent] = useState<CaptureDraftContent>({});
  const contentRef = useRef<CaptureDraftContent>({});
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const draftLifetime = useRef({ active: false, revision: 0 });
  const [step, setStep] = useState<CaptureWizardStep>(kind === "CUT" ? "reading" : "evidence");
  const [draftLoadStatus, setDraftLoadStatus] = useState<CaptureDraftLoadResult["status"] | "loading">("loading");
  const [formError, setFormError] = useState("");
  const [locating, setLocating] = useState(false);
  const [gpsRequest] = useState(createCaptureGpsRequest);
  const [submitting, setSubmitting] = useState(false);
  const [verificationUncertain, setVerificationUncertain] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const gpsException = content.gpsExceptionReason !== undefined;
  const photoException = content.exceptionReason !== undefined;
  const steps = captureWizardSteps(kind, gpsException, photoException);
  const activeStep = steps.includes(step) ? step : "evidence";
  const stepIndex = steps.indexOf(activeStep);
  const file = content.evidence?.[0] ? restoreEvidenceFile(content.evidence[0]) : undefined;
  const loading = !captureDraftCanAdvance(draftLoadStatus);
  const loadDraftRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    const lifetime = { active: true, revision: 0 };
    draftLifetime.current = lifetime;
    gpsRequest.invalidate();
    setLocating(false);
    const loadDraft = async () => {
      const revision = ++lifetime.revision;
      setDraftLoadStatus("loading");
      setFormError("");
      const result = await loadCaptureDraftSafely(() => store.loadCaptureDraft(order.orderId, kind));
      if (!lifetime.active || lifetime.revision !== revision) return;
      if (result.status === "error") {
        setDraftLoadStatus("error");
        return;
      }
      const restored = kind === "RECONNECTION" && !result.content.demora ? { ...result.content, demora: "Sin demora" } : result.content;
      contentRef.current = restored;
      setContent(restored);
      setDraftLoadStatus("ready");
    };
    loadDraftRef.current = loadDraft;
    void loadDraft();
    return () => { lifetime.active = false; gpsRequest.invalidate(); };
  }, [gpsRequest, kind, order.orderId, store]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--capture-viewport-height", `${height}px`);
      setKeyboardOpen(height < window.innerHeight - 120);
    };
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      window.removeEventListener("resize", updateViewport);
      document.documentElement.style.removeProperty("--capture-viewport-height");
    };
  }, []);

  function persist(next: CaptureDraftContent): Promise<void> {
    const lifetime = draftLifetime.current;
    const revision = ++lifetime.revision;
    contentRef.current = next;
    setContent(next);
    setFormError("");
    const save = saveChain.current.then(() => store.saveCaptureDraft(order.orderId, kind, next));
    saveChain.current = save.catch(() => undefined);
    void save.catch(() => {
      if (lifetime.active && lifetime.revision === revision) setFormError("No pudimos guardar el borrador en este dispositivo. Reintente.");
    });
    return save;
  }

  function change(patch: Partial<CaptureDraftContent>): void {
    if (Object.prototype.hasOwnProperty.call(patch, "gpsExceptionReason")) {
      gpsRequest.invalidate();
      setLocating(false);
    }
    void persist({ ...contentRef.current, ...patch }).catch(() => undefined);
  }

  function validate(current: CaptureWizardStep, draft: CaptureDraftContent): string | undefined {
    if (current === "reading" && (draft.reading?.value === undefined || !Number.isFinite(draft.reading.value) || draft.reading.value < 0)) return "Ingrese lectura final válida del medidor.";
    if (current === "gps" && !draft.location?.latitude && draft.location?.latitude !== 0 && draft.gpsExceptionReason === undefined) return "Capture GPS o registre excepción de coordenadas.";
    if (current === "gpsException" && !draft.gpsExceptionReason?.trim()) return "Justifique excepción de coordenadas.";
    if (current === "evidence" && !draft.evidence?.[0] && draft.exceptionReason === undefined) return "Adjunte JPEG/PNG o registre excepción.";
    if (current === "evidenceException" && !draft.exceptionReason?.trim()) return "Escriba una justificación para la excepción.";
    return undefined;
  }

  async function advance() {
    if (!captureDraftCanAdvance(draftLoadStatus)) return;
    const problem = validate(activeStep, contentRef.current);
    if (problem) return setFormError(problem);
    try {
      const lifetime = draftLifetime.current;
      const save = persist(contentRef.current);
      const revision = lifetime.revision;
      await save;
      if (!lifetime.active || lifetime.revision !== revision) return;
      setStep(steps[stepIndex + 1]);
    } catch { /* persist sets actionable error */ }
  }

  async function submit() {
    if (!captureDraftCanAdvance(draftLoadStatus)) return;
    const draft = kind === "RECONNECTION" && !contentRef.current.demora ? { ...contentRef.current, demora: "Sin demora" } : contentRef.current;
    if (kind === "RECONNECTION" && !draft.demora?.trim()) return setFormError("Escriba una observación o deje «Sin demora».");
    if (kind === "RECONNECTION" && (draft.demora?.length ?? 0) > 1000) return setFormError("La observación no puede superar 1000 caracteres.");
    for (const required of steps.slice(0, -1)) {
      const problem = validate(required, draft);
      if (problem) return setFormError(problem);
    }
    setSubmitting(true);
    try {
      await persist(draft);
      const fieldCapture: FieldCapture | undefined = kind === "CUT" ? {
        reading: { value: draft.reading!.value!, unit: "kWh", meterId: order.context?.meterId ?? "", recordedAt: new Date().toISOString(), status: "CAPTURED" },
        location: gpsException ? { recordedAt: new Date().toISOString(), status: "BYPASSED", exceptionReason: `saltar_control_coordenadas: ${draft.gpsExceptionReason}` } : draft.location as FieldCapture["location"],
        cutType: draft.cutType ?? "RED",
        nearbyMeters: draft.nearbyMeters ?? false,
      } : undefined;
      const completed = await onSubmit({
        file: photoException ? undefined : file,
        exceptionReason: photoException ? `saltar_control_fotos: ${draft.exceptionReason}` : undefined,
        gpsExceptionReason: gpsException ? `saltar_control_coordenadas: ${draft.gpsExceptionReason}` : undefined,
        demora: kind === "RECONNECTION" ? draft.demora : undefined,
        fieldCapture,
        reason: kind === "VISIT" ? "Visita de campo sin ejecución" : `Intento de ${actionLabel(kind).toLocaleLowerCase()}`,
      });
      if (!completed) setFormError("Esta acción no concluyó. Revise el estado de la orden y la cola local.");
    } catch (error) {
      const failure = captureSubmitError(error);
      if (failure.verificationUncertain) setVerificationUncertain(true);
      setFormError(failure.message);
    } finally { setSubmitting(false); }
  }

  function captureLocation() {
    gpsRequest.invalidate();
    setLocating(false);
    if (contentRef.current.gpsExceptionReason !== undefined) return;
    if (!navigator.geolocation) return setFormError("Este dispositivo no ofrece GPS; registre excepción controlada.");
    setFormError("");
    setLocating(true);
    gpsRequest.start(navigator.geolocation, (position) => {
      setLocating(false);
      if (contentRef.current.gpsExceptionReason !== undefined) return;
      change({ location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, recordedAt: new Date().toISOString(), status: "CAPTURED" } });
    }, () => { setLocating(false); setFormError("No pudimos capturar GPS. Reintente o registre excepción controlada."); });
  }

  const title: Record<CaptureWizardStep, string> = { reading: "Lectura", cutSettings: "Datos del corte", gps: "Ubicación GPS", gpsException: "Excepción GPS", evidence: "Evidencia", evidenceException: "Excepción de foto", review: "Revisar y confirmar" };
  return (
    <section className={`capture-wizard${keyboardOpen ? " capture-wizard--keyboard" : ""}`} aria-label={`Captura de ${actionLabel(kind).toLocaleLowerCase()}`}>
      <header className="capture-wizard__header"><button type="button" className="capture-wizard__back" onClick={() => stepIndex ? setStep(steps[stepIndex - 1]) : onCancel()} aria-label="Volver">← Volver</button><span>{stepIndex + 1} de {steps.length}</span></header>
      <div className="capture-wizard__identity"><strong>{order.context?.customerName || "Cliente no disponible"}</strong><span>Medidor {order.context?.meterId || "no disponible"} · {technicianName ?? order.assignedTechnicianId}</span></div>
      <div className="capture-wizard__body">
        <h3>{title[activeStep]}</h3>
        {draftLoadStatus === "loading" ? <p role="status">Abriendo borrador local…</p> : null}
        {draftLoadStatus === "error" ? <div className="capture-wizard__load-error" role="alert"><p>No pudimos abrir el borrador local. Reintente antes de continuar.</p><button type="button" className="secondary-action" onClick={() => void loadDraftRef.current()}>Reintentar carga del borrador</button></div> : null}
        {!loading && activeStep === "reading" ? <label className="text-field"><span>Lectura final del medidor (kWh)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={content.reading?.value ?? ""} onChange={(event) => change({ reading: event.target.value === "" ? {} : { value: Number(event.target.value) } })} /></label> : null}
        {!loading && activeStep === "cutSettings" ? <><label className="text-field"><span>Tipo de corte</span><select value={content.cutType ?? "RED"} onChange={(event) => change({ cutType: event.target.value as CutType })}><option value="RED">Red</option><option value="MEDIDOR">Medidor</option><option value="BARRAS">Barras</option><option value="PROTECCION">Protección</option><option value="ACOMETIDA">Acometida</option><option value="FUSIBLES">Fusibles</option></select></label><label className="checkbox-field"><input type="checkbox" checked={content.nearbyMeters ?? false} onChange={(event) => change({ nearbyMeters: event.target.checked })} /><span>Verifiqué medidores cercanos</span></label></> : null}
        {!loading && activeStep === "gps" ? <><p>{content.location?.status === "CAPTURED" ? `${content.location.latitude?.toFixed(6)}, ${content.location.longitude?.toFixed(6)} · precisión ${Math.round(content.location.accuracyMeters ?? 0)} m` : "Coordenadas no capturadas"}</p><button type="button" className="secondary-action" disabled={locating || gpsException} onClick={captureLocation}>{locating ? "Capturando…" : "Capturar GPS"}</button><label className="checkbox-field"><input type="checkbox" checked={gpsException} onChange={(event) => change(event.target.checked ? { location: undefined, gpsExceptionReason: "" } : { gpsExceptionReason: undefined })} /><span>No puedo capturar coordenadas</span></label></> : null}
        {!loading && activeStep === "gpsException" ? <label className="text-field"><span>Justificación de coordenadas</span><textarea rows={2} value={content.gpsExceptionReason ?? ""} onChange={(event) => change({ gpsExceptionReason: event.target.value })} /></label> : null}
        {!loading && activeStep === "evidence" ? <><EvidencePicker file={file} onSelect={(selected) => change({ evidence: [selected], exceptionReason: undefined })} onInvalid={() => setFormError("La evidencia debe ser JPEG o PNG.")} /><label className="checkbox-field"><input type="checkbox" checked={photoException} onChange={(event) => change(event.target.checked ? { evidence: [], exceptionReason: "" } : { exceptionReason: undefined })} /><span>No puedo adjuntar evidencia</span></label></> : null}
        {!loading && activeStep === "evidenceException" ? <label className="text-field"><span>Justificación obligatoria</span><textarea rows={2} value={content.exceptionReason ?? ""} onChange={(event) => change({ exceptionReason: event.target.value })} /></label> : null}
        {!loading && activeStep === "review" ? <div className="capture-wizard__review">{kind === "CUT" ? <><p>Lectura: {content.reading?.value ?? "No disponible"} kWh · {content.cutType ?? "RED"}</p><p>GPS: {gpsException ? "Excepción justificada" : content.location?.status === "CAPTURED" ? "Capturado" : "No disponible"}</p></> : null}<p>Evidencia: {photoException ? "Excepción justificada" : file?.name ?? "No disponible"}</p>{kind === "RECONNECTION" ? <label className="text-field"><span>Observación de demora</span><textarea rows={3} maxLength={1000} value={content.demora ?? "Sin demora"} onChange={(event) => change({ demora: event.target.value })} /><small>Si no hubo demora, deje «Sin demora».</small></label> : null}{kind === "CUT" ? <p className="capture-wizard__authorization-note">El corte requiere autorización online concluyente y vigente. Sin ella, queda bloqueado.</p> : <p>El resultado se guarda primero en este dispositivo.</p>}</div> : null}
      </div>
      {formError ? <p className="form-error capture-wizard__error" role="alert">{formError}</p> : null}
      <footer className="capture-wizard__footer"><button type="button" className="primary-action" disabled={loading || submitting || busy || blocked || verificationUncertain} onClick={() => void (activeStep === "review" ? submit() : advance())}>{submitting || busy ? "Guardando…" : activeStep === "review" ? kind === "CUT" ? "Confirmar corte" : kind === "VISIT" ? "Guardar visita" : "Confirmar reconexión" : "Continuar"}</button></footer>
    </section>
  );
}

export function restoreEvidenceFile(value: File | Blob): File {
  if (value instanceof File) return value;
  const extension = value.type === "image/png" ? "png" : "jpg";
  return new File([value], `evidencia-recuperada.${extension}`, { type: value.type });
}

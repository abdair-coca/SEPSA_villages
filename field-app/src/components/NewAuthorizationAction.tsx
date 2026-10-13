/**
 * Botón "Solicitar nueva autorización/habilitación" para un corte o una reconexión cuya autorización anterior el
 * servidor informó como no usada (D022). Pide confirmación explícita antes de cerrar la operación y repetirla con
 * la misma foto y datos. No afirma que la acción física no ocurrió: solo que la autorización no se usó.
 */
import { useState } from "react";
import type { OperationRecord } from "../domain/types";
import { canRequestNewAuthorization } from "../use-cases/close-unconsumed";

const PROOF_LABEL = { expired: "vencida", rejected: "rechazada", not_found: "sin registro en el servidor" } as const;

export function NewAuthorizationAction({ record, busy, onConfirm }: { record: OperationRecord; busy: boolean; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!canRequestNewAuthorization(record) || !record.lastAuthorizationLookup) return null;
  const noun = record.action === "CUT" ? "autorización" : "habilitación";
  if (!confirming) {
    return <button type="button" className="secondary-action new-authorization-action" disabled={busy} onClick={() => setConfirming(true)}>Solicitar nueva {noun}</button>;
  }
  return (
    <div className="new-authorization-confirm" role="group" aria-label={`Confirmar nueva ${noun}`}>
      <p>La {noun} anterior no se usó ({PROOF_LABEL[record.lastAuthorizationLookup.status]}). Se pedirá una nueva con la misma foto y los mismos datos; no tiene que capturarlos otra vez.</p>
      <div className="new-authorization-confirm__actions">
        <button type="button" className="primary-action" disabled={busy} onClick={() => { setConfirming(false); onConfirm(); }}>Confirmar y solicitar</button>
        <button type="button" className="secondary-action" onClick={() => setConfirming(false)}>Cancelar</button>
      </div>
    </div>
  );
}

import { AppModal } from "./Modal";

export function ExitConfirmationModal({ onStay, onExit }: { onStay: () => void; onExit: () => void }) {
  return <AppModal titleId="exit-modal-title" eyebrow="Salir" title="¿Quieres salir de la aplicación?" onClose={onStay}>
    <p className="admin-modal__intro">Los datos guardados localmente no se perderán.</p>
    <div className="admin-modal__actions"><button className="secondary-action" type="button" onClick={onStay}>Seguir aquí</button><button className="primary-action" type="button" onClick={onExit}>Salir</button></div>
  </AppModal>;
}

import type { ReactNode } from "react";

export interface AppModalProps {
  titleId: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function AppModal({ titleId, eyebrow, title, onClose, children }: AppModalProps) {
  return <div className="admin-modal-backdrop"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}><div className="admin-modal__header"><div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2 id={titleId}>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">×</button></div>{children}</section></div>;
}

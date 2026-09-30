import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { activateDialog, resolveDialogTheme, type DialogCloseOptions } from "./dialog-lifecycle";

export interface AppModalProps {
  titleId: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  describedBy?: string;
  closeDisabled?: boolean;
  hideCloseButton?: boolean;
  variant?: "default" | "completion";
  icon?: ReactNode;
  className?: string;
}

export function AppModal({ titleId, eyebrow, title, onClose, children, describedBy, closeDisabled = false, hideCloseButton = false, variant = "default", icon, className }: AppModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeOptions = useRef<DialogCloseOptions>({ onClose, closeDisabled });
  closeOptions.current = { onClose, closeDisabled };
  const completion = variant === "completion";
  const [theme] = useState(() => typeof document === "undefined" ? (completion ? "field" : "admin") : resolveDialogTheme(document, completion ? "field" : "admin"));

  useEffect(() => {
    if (!dialogRef.current || !rootRef.current) return;
    return activateDialog(dialogRef.current, rootRef.current, () => closeOptions.current);
  }, []);

  const closeButton = hideCloseButton ? null : <button className="icon-button" type="button" onClick={() => { if (!closeDisabled) onClose(); }} disabled={closeDisabled} aria-label="Cerrar">×</button>;
  const content = (
    <div ref={rootRef} className={`ui-modal-root ${completion ? "cut-completion-backdrop" : "admin-modal-backdrop"}`} data-ui-theme={theme}>
      <section ref={dialogRef} className={[completion ? "cut-completion" : "admin-modal", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} tabIndex={-1}>
        {completion ? <>
          {closeButton}
          {icon ? <div className="cut-completion__icon" aria-hidden="true">{icon}</div> : null}
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2 id={titleId}>{title}</h2>
        </> : <div className="admin-modal__header"><div>{icon ? <span className="ui-modal__icon" aria-hidden="true">{icon}</span> : null}{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2 id={titleId}>{title}</h2></div>{closeButton}</div>}
        {children}
      </section>
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

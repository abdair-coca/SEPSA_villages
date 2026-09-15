import type { ReactNode } from "react";

export type NotificationTone = "success" | "info" | "warning" | "error";

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface NotificationProps {
  tone: NotificationTone;
  text: ReactNode;
  action?: NotificationAction;
  onDismiss?: () => void;
}

export function Notification({ tone, text, action, onDismiss }: NotificationProps) {
  return (
    <div className={`message notification message--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <span className="notification__text">{text}</span>
      {action || onDismiss ? (
        <div className="notification__actions">
          {action ? <button type="button" className="notification__action" onClick={action.onClick}>{action.label}</button> : null}
          {onDismiss ? <button type="button" className="notification__dismiss" onClick={onDismiss} aria-label="Cerrar notificación">×</button> : null}
        </div>
      ) : null}
    </div>
  );
}

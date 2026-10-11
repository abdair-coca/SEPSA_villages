import type { ReactNode } from "react";
import { IconAlertTriangle, IconBan, IconCheckCircle, IconInfo } from "./Icons";

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

export interface NotificationAutoDismissOptions {
  isMobile: boolean;
  hasAction?: boolean;
  transient?: boolean;
}

export const NOTIFICATION_AUTO_DISMISS_MS = 4000;

const toneLabels: Record<NotificationTone, string> = {
  success: "Éxito",
  info: "Información",
  warning: "Advertencia",
  error: "Error",
};

const toneIcons = {
  success: IconCheckCircle,
  info: IconInfo,
  warning: IconAlertTriangle,
  error: IconBan,
};

export function shouldAutoDismissNotification(tone: NotificationTone, options: NotificationAutoDismissOptions): boolean {
  const isRoutine = tone === "success" || tone === "info";
  return isRoutine && !options.hasAction && (options.isMobile || options.transient === true);
}

export function Notification({ tone, text, action, onDismiss }: NotificationProps) {
  const ToneIcon = toneIcons[tone];

  return (
    <div className={`message notification message--${tone}`} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
      <span className={`notification__kind notification__kind--${tone}`}>
        <ToneIcon className="notification__glyph" />
        <span>{toneLabels[tone]}</span>
      </span>
      <span className="notification__text">{text}</span>
      {action ? (
        <div className="notification__actions">
          <button type="button" className="notification__action" onClick={action.onClick}>{action.label}</button>
          {onDismiss ? <button type="button" className="notification__dismiss" onClick={onDismiss} aria-label="Cerrar notificación">×</button> : null}
        </div>
      ) : null}
      {!action && onDismiss ? <button type="button" className="notification__dismiss notification__dismiss--standalone" onClick={onDismiss} aria-label="Cerrar notificación">×</button> : null}
    </div>
  );
}

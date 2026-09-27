import type { ReactNode } from "react";
import type { Session } from "../domain";
import { IconUser } from "./Icons";

type AppHeaderProps =
  | {
      variant: "field";
      onLogout?: () => void;
      context: ReactNode;
      actions: ReactNode;
    }
  | {
      variant: "admin";
      session: Session;
      onLogout: () => void;
    };

export function AppHeader(props: AppHeaderProps) {
  if (props.variant === "admin") {
    const displayName = props.session.displayName ?? props.session.username;

    return (
      <>
        <div className="admin-topbar">
          <div className="admin-topbar__inner">
            <div className="admin-brand-lockup">
              <span className="admin-brand-mark" aria-hidden="true" />
              <strong>SEPSA</strong>
              <span>Sistema de Operaciones</span>
            </div>
            <div className="admin-topbar__tools">
              <span className="admin-environment"><span className="admin-environment__dot" aria-hidden="true" />Administración <strong>{props.session.authenticity}</strong></span>
              <span className="admin-notification" aria-hidden="true" />
              <span className="admin-avatar" aria-hidden="true">{initials(displayName)}</span>
              <div className="admin-user-summary"><strong>{displayName}</strong><span>Admin</span></div>
              <button className="admin-logout-link" type="button" onClick={props.onLogout}>Cerrar sesión</button>
            </div>
          </div>
        </div>
        <header className="operations-header admin-header">
          <div className="admin-brand">
            <HeaderTitle title="Centro de control de órdenes de corte" description="Busca suministros con mora, genera órdenes y asigna técnicos." />
          </div>
        </header>
      </>
    );
  }

  return (
    <header className="app-header">
      <div className="identity-block">
        <div className="identity-brand-row">
          <div className="field-brand"><strong>SEPSA</strong><span>CAMPO</span></div>
          {props.onLogout ? <button type="button" className="header-profile-button" onClick={props.onLogout} aria-label="Cerrar sesión"><IconUser /></button> : null}
        </div>
        <HeaderTitle title="Jornada de campo" description="Órdenes asignadas, ejecución de cortes y sincronización en terreno." descriptionClassName="identity" />
        <div className="header-context">
          {props.context}
        </div>
      </div>
      {props.actions}
    </header>
  );
}

function HeaderTitle({ title, description, descriptionClassName }: { title: string; description: string; descriptionClassName?: string }) {
  return <><h1>{title}</h1><p className={descriptionClassName}>{description}</p></>;
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "AD";
}

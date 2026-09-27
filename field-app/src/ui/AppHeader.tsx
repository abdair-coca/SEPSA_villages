import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BrandLockup } from "./BrandLockup";

export interface AppHeaderUser {
  displayName: string;
  roleLabel: string;
  authenticity?: string;
}

export type AppHeaderStatusTone = "positive" | "warning" | "negative" | "environment";

export interface AppHeaderStatus {
  label: string;
  tone: AppHeaderStatusTone;
}

export interface AppHeaderProps {
  role: "admin" | "field";
  title: string;
  description: string;
  user: AppHeaderUser;
  context?: ReactNode;
  status?: AppHeaderStatus;
  actions?: ReactNode;
  onLogout?: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuId = `app-header-account-menu-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const closeFromOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (accountMenuRef.current?.contains(target) || accountButtonRef.current?.contains(target)) return;
      closeAccountMenu();
    };
    const closeFromKeyboard = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      closeAccountMenu();
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [isAccountMenuOpen]);

  function closeAccountMenu(): void {
    setIsAccountMenuOpen(false);
    window.requestAnimationFrame(() => accountButtonRef.current?.focus());
  }

  function toggleAccountMenu(): void {
    setIsAccountMenuOpen((current) => !current);
  }

  function logout(): void {
    setIsAccountMenuOpen(false);
    props.onLogout?.();
  }

  return (
    <header className={`app-header app-shell app-header--${props.role}`} data-shell="shared">
      <div className="app-header__topbar">
        <div className="identity-brand-row app-header__brand">
          <BrandLockup area={props.role === "admin" ? "OPERACIONES" : "CAMPO"} />
        </div>

        <div className="app-header__topbar-actions">
          {props.status ? <HeaderStatus status={props.status} /> : null}
          <div className="app-header__account">
            <button
              ref={accountButtonRef}
              className="app-header__account-trigger"
              type="button"
              aria-label={`Abrir menú de ${props.user.displayName}`}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              aria-controls={accountMenuId}
              onClick={toggleAccountMenu}
            >
              <span className="app-header__avatar" aria-hidden="true">{initials(props.user.displayName)}</span>
              <span className="app-header__chevron" aria-hidden="true" />
            </button>

            <div
              ref={accountMenuRef}
              id={accountMenuId}
              className="app-header__account-menu"
              role="menu"
              aria-label="Menú de usuario"
              hidden={!isAccountMenuOpen}
            >
              <div className="app-header__account-info">
                <strong>{props.user.displayName}</strong>
                <span>{props.user.roleLabel}</span>
                {props.user.authenticity ? <span>Entorno · {props.user.authenticity}</span> : null}
              </div>
              {props.onLogout ? (
                <button className="app-header__logout" type="button" role="menuitem" onClick={logout}>
                  Cerrar sesión
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="app-header__body">
        <div className="identity-block">
          <HeaderTitle title={props.title} description={props.description} />
          {props.context ? <div className="header-context">{props.context}</div> : null}
        </div>
        {props.actions ? <div className="app-header__actions">{props.actions}</div> : null}
      </div>
    </header>
  );
}

function HeaderStatus({ status }: { status: AppHeaderStatus }) {
  return (
    <div className="app-header__status">
      <span className={`app-status-badge app-status-badge--${status.tone}`}>
        <span className={`app-status-badge__dot app-status-badge__dot--${status.tone}`} aria-hidden="true" />
        <span>{status.label}</span>
      </span>
    </div>
  );
}

function HeaderTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-header__heading">
      <h1>{title}</h1>
      <p className="app-header__description">{description}</p>
    </div>
  );
}

function initials(value: string): string {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "AD";
}

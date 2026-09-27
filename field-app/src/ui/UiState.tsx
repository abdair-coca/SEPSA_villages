import type { ComponentPropsWithoutRef } from "react";

type StateTone = "loading" | "error";
type StateElement = "main" | "div";

export interface AppStateCardProps {
  tone: StateTone;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void; variant?: "primary" | "secondary" };
  as?: StateElement;
  className?: string;
}

/** Shared presentation for recoverable loading and error states. */
export function AppStateCard({ tone, title, description, action, as = "div", className }: AppStateCardProps) {
  const Element: "main" | "div" = as;
  const classNames = ["ui-state-card", `ui-state-card--${tone}`, className].filter(Boolean).join(" ");
  const props: ComponentPropsWithoutRef<"div"> = {
    className: classNames,
    role: tone === "error" ? "alert" : undefined,
    "aria-live": tone === "loading" ? "polite" : undefined,
  };

  return (
    <Element {...props}>
      {tone === "loading" ? <span className="ui-state-card__mark" aria-hidden="true" /> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <button className={`${action.variant ?? "primary"}-action`} type="button" onClick={action.onClick}>{action.label}</button> : null}
    </Element>
  );
}

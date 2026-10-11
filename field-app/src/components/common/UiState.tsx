import type { ComponentPropsWithoutRef } from "react";

type StateTone = "loading" | "error" | "empty";
type StateElement = "main" | "div";

export interface AppStateCardProps {
  tone: StateTone;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void; variant?: "primary" | "secondary" };
  as?: StateElement;
  className?: string;
  layout?: "panel" | "inline";
}

/** Shared presentation for loading, empty and recoverable error states. */
export function AppStateCard({ tone, title, description, action, as = "div", className, layout = "panel" }: AppStateCardProps) {
  const Element: "main" | "div" = as;
  const classNames = ["ui-state-card", `ui-state-card--${tone}`, `ui-state-card--${layout}`, className].filter(Boolean).join(" ");
  const props: ComponentPropsWithoutRef<"div"> = {
    className: classNames,
    role: tone === "error" ? "alert" : "status",
    "aria-live": tone === "error" ? undefined : "polite",
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

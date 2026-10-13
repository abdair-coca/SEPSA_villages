/**
 * Navegación principal del técnico: barra lateral en escritorio y barra inferior en móvil, con las mismas
 * cuatro pestañas y el indicador de operaciones pendientes en "Pendientes". No cambia de pestaña por sí sola.
 */
import type { ReactNode } from "react";
import type { AppState } from "../state/store";
import { IconDocument, IconMap, IconRefresh, IconRoute } from "./common/Icons";

export type NavigationTab = "home" | "orders" | "map" | "queue";
const navigationItems: Array<{ tab: NavigationTab; label: string; icon: ReactNode }> = [
  { tab: "home", label: "Inicio", icon: <IconRoute /> },
  { tab: "orders", label: "Mis órdenes", icon: <IconDocument /> },
  { tab: "map", label: "Mapa", icon: <IconMap /> },
  { tab: "queue", label: "Pendientes", icon: <IconRefresh /> },
];

export function DesktopNavigation({ activeTab, onNavigate, pending }: { activeTab: AppState["tab"]; onNavigate: (tab: NavigationTab) => void; pending: number }) {
  return <nav className="desktop-navigation" aria-label="Navegación principal de escritorio"><span className="desktop-navigation__context">Jornada técnica</span><div className="desktop-navigation__items">{navigationItems.map((item) => <button type="button" key={item.tab} className={activeTab === item.tab ? "desktop-navigation__item desktop-navigation__item--active" : "desktop-navigation__item"} onClick={() => onNavigate(item.tab)} aria-current={activeTab === item.tab ? "page" : undefined}>{item.icon}<span>{item.label}</span>{item.tab === "queue" && pending ? <i role="img" aria-label={`${pending} operaciones pendientes`} /> : null}</button>)}</div></nav>;
}

export function BottomNavigation({ activeTab, onNavigate, pending }: { activeTab: AppState["tab"]; onNavigate: (tab: "home" | "orders" | "map" | "queue") => void; pending: number }) {
  return <nav className="bottom-navigation" aria-label="Navegación principal">{navigationItems.map((item) => <button type="button" key={item.tab} className={activeTab === item.tab ? "bottom-navigation__item bottom-navigation__item--active" : "bottom-navigation__item"} onClick={() => onNavigate(item.tab)} aria-current={activeTab === item.tab ? "page" : undefined}>{item.icon}<span>{item.label}</span>{item.tab === "queue" && pending ? <i role="img" aria-label={`${pending} operaciones pendientes`} /> : null}</button>)}</nav>;
}

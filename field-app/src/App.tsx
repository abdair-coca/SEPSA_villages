import { createDemoAppStore, createUnavailableAppStore } from "./app/index";
import { FieldApp } from "./ui";

const defaultStore = typeof indexedDB === "undefined" ? createUnavailableAppStore() : createDemoAppStore();

export function App() {
  return <FieldApp store={defaultStore} />;
}

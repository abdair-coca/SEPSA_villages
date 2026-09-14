import type { ConnectivityMode } from "../../domain";
import type { ConnectivityPort } from "../../ports";

export interface BrowserConnectivityOptions {
  probeUrl?: string;
  intervalMs?: number;
  weakThresholdMs?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class BrowserConnectivity implements ConnectivityPort {
  private currentMode: ConnectivityMode;
  private readonly listeners = new Set<(mode: ConnectivityMode) => void>();
  private readonly probeUrl: string;
  private readonly intervalMs: number;
  private readonly weakThresholdMs: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private isProbing = false;

  constructor(options: BrowserConnectivityOptions = {}) {
    this.probeUrl = options.probeUrl ?? "/favicon.svg";
    this.intervalMs = options.intervalMs ?? 15000;
    this.weakThresholdMs = options.weakThresholdMs ?? 1500;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis);

    const initialOnline =
      typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? navigator.onLine
        : true;
    this.currentMode = initialOnline ? "online" : "offline";

    this.bindWindowEvents();
    this.start();
  }

  mode(): ConnectivityMode {
    return this.currentMode;
  }

  getMode(): ConnectivityMode {
    return this.currentMode;
  }

  isUsable(): boolean {
    return this.currentMode !== "offline";
  }

  setMode(mode: ConnectivityMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.notify();
  }

  subscribe(listener: (mode: ConnectivityMode) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async checkNow(): Promise<ConnectivityMode> {
    return this.probe();
  }

  async probe(): Promise<ConnectivityMode> {
    if (this.isProbing) return this.currentMode;
    this.isProbing = true;

    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this.setMode("offline");
        return "offline";
      }

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

      const startTime = Date.now();
      try {
        const url = `${this.probeUrl}?probe=${startTime}`;
        const response = await this.fetchFn(url, {
          method: "HEAD",
          cache: "no-store",
          signal: controller?.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);
        const rtt = Date.now() - startTime;

        if (response.ok || response.status === 304 || response.status === 404) {
          // El servidor respondió; clasificar por tiempo de ida y vuelta (RTT)
          const nextMode: ConnectivityMode = rtt >= this.weakThresholdMs ? "weak" : "online";
          this.setMode(nextMode);
          return nextMode;
        } else {
          // Error 5xx o respuesta inválida
          this.setMode("weak");
          return "weak";
        }
      } catch {
        if (timeoutId) clearTimeout(timeoutId);
        this.setMode("offline");
        return "offline";
      }
    } finally {
      this.isProbing = false;
    }
  }

  start(): void {
    if (this.timerId !== null || typeof window === "undefined") return;
    this.timerId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        // Pausar comprobaciones mientras la pantalla esté apagada o en segundo plano
        return;
      }
      void this.probe();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentMode);
      } catch {
        // Los errores en observadores no deben romper el loop de notificación
      }
    }
  }

  private bindWindowEvents(): void {
    if (typeof window === "undefined") return;

    window.addEventListener("online", () => {
      // Comprobar de inmediato ante evento del sistema
      void this.probe();
    });

    window.addEventListener("offline", () => {
      this.setMode("offline");
    });

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          // Al volver a primer plano, verificar inmediatamente
          void this.probe();
        }
      });
    }
  }
}

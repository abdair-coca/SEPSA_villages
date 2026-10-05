export interface SecurityEvent {
  event: "auth.login" | "auth.logout" | "http.request.rejected" | "authorization.cut" | "authorization.reconnection" | "sync.operation" | "evidence.upload";
  requestId: string;
  result: string;
  status?: number;
}

export interface SecurityLogger {
  log(event: SecurityEvent): void;
}

export class ConsoleSecurityLogger implements SecurityLogger {
  log(event: SecurityEvent): void {
    console.info(JSON.stringify(event));
  }
}

/**
 * Puerto del registro sincronizado del técnico en el servidor (solo lectura). Lo implementa el backend piloto
 * (`adapters/http/client.ts`). Es opcional en la jornada: sin él (por ejemplo, en modo simulado) la ficha de la
 * orden no ofrece la consulta.
 */
import type { Session, TechnicianRecordEntry } from "../domain/types";

export interface TechnicianRecordPort {
  /** Operaciones que el servidor tiene de una orden del técnico autenticado, más recientes primero. */
  listOrderRecord(session: Session, orderId: string): Promise<TechnicianRecordEntry[]>;
}

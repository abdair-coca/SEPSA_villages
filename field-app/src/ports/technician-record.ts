/**
 * Puerto del registro sincronizado del técnico en el servidor (solo lectura). Lo implementa el backend piloto
 * (`adapters/http/client.ts`). Es opcional en la jornada: sin él (por ejemplo, en modo simulado) la ficha de la
 * orden no ofrece la consulta.
 */
import type { Session, TechnicianEvidenceImage, TechnicianRecordEntry } from "../domain/types";

export interface TechnicianRecordPort {
  /** Operaciones que el servidor tiene de una orden del técnico autenticado, más recientes primero. */
  listOrderRecord(session: Session, orderId: string): Promise<TechnicianRecordEntry[]>;
  /** Foto propia del técnico; el cliente comprueba que sus bytes coinciden con el hash guardado. */
  readEvidence(session: Session, evidenceId: string): Promise<TechnicianEvidenceImage>;
}

/** El mismo registro ya ligado a la sesión activa: lo que consumen la ficha de la orden y su diálogo. */
export interface ServerRecordSource {
  listOrder(orderId: string): Promise<TechnicianRecordEntry[]>;
  readEvidence(evidenceId: string): Promise<TechnicianEvidenceImage>;
}

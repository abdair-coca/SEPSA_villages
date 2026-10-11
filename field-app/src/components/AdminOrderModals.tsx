/**
 * Diálogos del administrador para crear órdenes (una o en lote) y asignar un técnico. Bloquean el cierre y
 * los controles mientras la operación está en curso, y no permiten confirmar si falta algún suministro.
 */
import type { DebtorRecord, TechnicianRecord, WorkOrder } from "../domain/types";
import { AppModal } from "./common/Modal";
import { getMissingOrderCreationDebtorIds } from "../utils/filters";

/** Diálogo de creación abierto: una orden (`single`) o un lote (`batch`). */
export interface OrderCreationDialog {
  mode: "single" | "batch";
  debtorIds: string[];
}

export function OrderCreationModal({ dialog, debtors, technicians, selectedTechnician, busy, onTechnicianChange, onCancel, onConfirm }: { dialog: OrderCreationDialog; debtors: DebtorRecord[]; technicians: readonly TechnicianRecord[]; selectedTechnician: string; busy: boolean; onTechnicianChange: (technicianId: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const selectedDebtors = dialog.debtorIds.map((debtorId) => debtors.find((debtor) => debtor.debtorId === debtorId)).filter((debtor): debtor is DebtorRecord => Boolean(debtor));
  const missingDebtorIds = getMissingOrderCreationDebtorIds(dialog.debtorIds, debtors);
  const isBatch = dialog.mode === "batch";
  return <AppModal titleId="order-modal-title" eyebrow={isBatch ? "Creación masiva" : "Nueva orden"} title={isBatch ? "Crear y asignar órdenes" : "Crear y asignar orden de corte"} onClose={onCancel} closeDisabled={busy}><p className="admin-modal__intro">Revisa el suministro y selecciona el técnico responsable antes de confirmar.</p><div className="admin-modal__context"><div className="admin-modal__supply-list">{selectedDebtors.map((debtor) => <article className="admin-modal__supply" key={debtor.debtorId}><strong>{debtor.customerName}</strong><span>{debtor.supplyId} · Cuenta {debtor.accountId}</span><small>{debtor.address}</small></article>)}{missingDebtorIds.map((debtorId) => <article className="admin-modal__supply" key={debtorId}><strong>Suministro no disponible</strong><span>ID {debtorId}</span></article>)}</div>{missingDebtorIds.length ? <p role="alert">No se puede confirmar: actualice los resultados para incluir todos los suministros seleccionados.</p> : null}</div><label className="text-field"><span>Asignar a técnico</span><select value={selectedTechnician} onChange={(event) => onTechnicianChange(event.target.value)} disabled={busy || !technicians.length}><option value="" disabled>{technicians.length ? "Seleccione un técnico" : "No hay técnicos habilitados"}</option>{technicians.map((technician) => <option key={technician.userId} value={technician.userId}>{technicianOptionLabel(technician)}</option>)}</select></label><div className="admin-modal__actions"><button className="secondary-action" type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="primary-action" type="button" onClick={onConfirm} disabled={busy || missingDebtorIds.length > 0 || selectedDebtors.length !== dialog.debtorIds.length || !selectedTechnician}>{busy ? "Creando…" : isBatch ? "Aceptar y crear órdenes" : "Aceptar y crear orden"}<span>→</span></button></div></AppModal>;
}

export function OrderAssignmentModal({ order, technicians, selectedTechnician, busy, onTechnicianChange, onCancel, onConfirm }: { order: WorkOrder; technicians: readonly TechnicianRecord[]; selectedTechnician: string; busy: boolean; onTechnicianChange: (technicianId: string) => void; onCancel: () => void; onConfirm: () => void }) {
  return <AppModal titleId="assignment-modal-title" eyebrow="Asignación" title="Asignar técnico" onClose={onCancel} closeDisabled={busy}><p className="admin-modal__intro">Selecciona técnico responsable para continuar con esta orden.</p><div className="admin-modal__context"><article className="admin-modal__supply"><strong>{order.context?.customerName ?? order.accountId ?? "Suministro"}</strong><span>Cuenta {order.context?.accountId ?? order.accountId ?? "Dato no disponible"}</span><small>{order.context?.address ?? "Dirección no disponible"}</small></article></div><label className="text-field"><span>Asignar a técnico</span><select value={selectedTechnician} onChange={(event) => onTechnicianChange(event.target.value)} disabled={busy || !technicians.length}><option value="" disabled>{technicians.length ? "Seleccione un técnico" : "No hay técnicos habilitados"}</option>{technicians.map((technician) => <option key={technician.userId} value={technician.userId}>{technicianOptionLabel(technician)}</option>)}</select></label><div className="admin-modal__actions"><button className="secondary-action" type="button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="primary-action" type="button" onClick={onConfirm} disabled={busy || !selectedTechnician}>{busy ? "Asignando…" : "Asignar técnico"}<span>→</span></button></div></AppModal>;
}

function technicianOptionLabel(technician: TechnicianRecord): string { return technician.displayName || technician.username; }

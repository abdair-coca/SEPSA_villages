/**
 * Panel de búsqueda de morosos del administrador: texto, filtros (área, localidad, ruta, facturas vencidas,
 * estado), resultados paginados, selección individual o en lote y estados de carga/error/vacío.
 * Solo presenta y avisa cambios; la búsqueda y la creación las decide `screens/OperationsApp.tsx`.
 */
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { DebtorRecord } from "../domain/types";
import { AppStateCard } from "./common/UiState";
import { SearchField } from "./common/SearchField";
import { PaginationControls } from "./common/PaginationControls";
import type { AdminFilterOptions } from "../utils/filters";
import { ADMIN_SUPPLIES_PAGE_SIZE } from "../utils/pagination";
import { formatAdminMoney } from "../utils/format";

/** Filtros del formulario de búsqueda (texto tal como lo escribe el usuario). */
export interface SearchFilters {
  query: string;
  area: string;
  locality: string;
  route: string;
  minMonthsPending: string;
  supplyStatus: string;
}

interface DebtorSearchPanelProps {
  filters: SearchFilters;
  availableFilterOptions: AdminFilterOptions;
  debtors: DebtorRecord[];
  totalDebtors: number;
  suppliesPageData: { items: DebtorRecord[]; page: number; totalPages: number };
  selectedDebtor: string;
  selectedDebtorIds: string[];
  loading: boolean;
  loadError: string;
  searching: boolean;
  busy: boolean;
  onFiltersChange: Dispatch<SetStateAction<SearchFilters>>;
  onAreaChange: (area: string) => void;
  onSearch: (event: FormEvent) => void;
  onClear: () => Promise<void>;
  onToggleAll: () => void;
  onPrepareBatch: () => void;
  onSelectDebtor: (debtorId: string) => void;
  onToggleDebtor: (debtorId: string) => void;
  onRetry: () => Promise<void>;
  onSuppliesPageChange: (page: number) => void;
}

export function DebtorSearchPanel({
  filters, availableFilterOptions, debtors, totalDebtors, suppliesPageData, selectedDebtor, selectedDebtorIds, loading, loadError, searching, busy,
  onFiltersChange, onAreaChange, onSearch, onClear, onToggleAll, onPrepareBatch, onSelectDebtor, onToggleDebtor, onRetry, onSuppliesPageChange,
}: DebtorSearchPanelProps) {
  const allDebtorsSelected = debtors.length > 0 && debtors.every((debtor) => selectedDebtorIds.includes(debtor.debtorId));

  return (
          <section className="panel operations-search" aria-labelledby="supplies-title">
            <div className="panel-heading"><span className="panel-heading__icon panel-heading__icon--list" aria-hidden="true" /><div><span className="eyebrow">Buscar morosos</span><h2 id="supplies-title">Buscar morosos</h2><p className="panel-subtitle">Busca y selecciona un suministro para crear una orden de corte.</p></div><span className="count-badge">{totalDebtors} resultados</span></div>
            <form className="admin-search-form admin-search-form--extended" onSubmit={onSearch}>
              <SearchField id="admin-search" label="Buscar morosos" value={filters.query} onChange={(query) => onFiltersChange((current) => ({ ...current, query }))} onClear={() => onFiltersChange((current) => ({ ...current, query: "" }))} busy={searching} disabled={busy} placeholder="Buscar por nombre, cuenta, área, localidad, ruta o estado" />
              <div className="compact-filters">
                 <label className="text-field"><span>Área</span><select value={filters.area} onChange={(event) => onAreaChange(event.target.value)}><option value="">Todas</option>{availableFilterOptions.areas.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                 <label className="text-field"><span>Localidad</span><select value={filters.locality} onChange={(event) => onFiltersChange({ ...filters, locality: event.target.value })}><option value="">Todas</option>{availableFilterOptions.localities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                 <label className="text-field"><span>Ruta</span><select value={filters.route} onChange={(event) => onFiltersChange({ ...filters, route: event.target.value })}><option value="">Todas</option>{availableFilterOptions.routes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="text-field"><span>Facturas vencidas</span><input type="number" min="0" inputMode="numeric" value={filters.minMonthsPending} onChange={(event) => onFiltersChange({ ...filters, minMonthsPending: event.target.value })} /></label>
                 <label className="text-field"><span>Estado del suministro</span><select value={filters.supplyStatus} onChange={(event) => onFiltersChange({ ...filters, supplyStatus: event.target.value })}><option value="">Todos</option>{availableFilterOptions.statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </div>
               <div className="filter-actions"><button className="primary-action" type="submit" disabled={searching || busy}>{searching ? "Consultando…" : "Buscar morosos"}<span>→</span></button><button className="filter-reset" type="button" onClick={() => void onClear()} disabled={searching || busy}>Limpiar</button><button className="secondary-action filter-select-all" type="button" onClick={onToggleAll} disabled={!debtors.length || searching || busy}>{allDebtorsSelected ? "Quitar página" : "Seleccionar página"}</button>{selectedDebtorIds.length ? <button className="primary-action filter-batch-action" type="button" onClick={onPrepareBatch} disabled={busy}>Crear y asignar ({selectedDebtorIds.length})<span>→</span></button> : null}</div>
            </form>

            <AdminSelectionSummary selectedCount={selectedDebtorIds.length} visibleSelectedCount={suppliesPageData.items.filter((debtor) => selectedDebtorIds.includes(debtor.debtorId)).length} />

             <div className="results-heading"><span><strong>{loading ? "Consultando suministros…" : `${totalDebtors} suministros encontrados`}</strong><small>Ordenados por deuda pendiente</small></span></div>
              {loading ? <AdminLoadingState /> : loadError && !debtors.length ? <AdminErrorState message={loadError} onRetry={() => void onRetry()} /> : <>
                <div className="admin-record-list">{suppliesPageData.items.map((debtor, index) => <DebtorItem key={debtor.debtorId} debtor={debtor} position={(suppliesPageData.page - 1) * ADMIN_SUPPLIES_PAGE_SIZE + index + 1} selected={selectedDebtor === debtor.debtorId} checked={selectedDebtorIds.includes(debtor.debtorId)} onSelect={() => onSelectDebtor(debtor.debtorId)} onToggle={() => onToggleDebtor(debtor.debtorId)} />)}</div>
                {suppliesPageData.totalPages > 1 ? <PaginationControls className="admin-pagination supply-pagination" label="Paginación de suministros" page={suppliesPageData.page} totalPages={suppliesPageData.totalPages} onPrevious={() => onSuppliesPageChange(suppliesPageData.page - 1)} onNext={() => onSuppliesPageChange(suppliesPageData.page + 1)} /> : null}
                {loadError ? <AdminInlineError message={loadError} onRetry={() => void onRetry()} /> : null}
                {!debtors.length && !loadError ? <AppStateCard tone="empty" layout="inline" className="empty-state" title="No hay resultados con estos filtros" description="Ajusta la búsqueda y vuelve a consultar." /> : null}
              </>}

          </section>
  );
}

export function AdminSelectionSummary({ selectedCount, visibleSelectedCount }: { selectedCount: number; visibleSelectedCount: number }) {
  if (!selectedCount) return null;
  return <div className="admin-selection-summary" role="status" aria-live="polite"><strong>{selectedCount} suministros seleccionados</strong><span>{visibleSelectedCount} en esta página · La selección se conserva al cambiar de página.</span></div>;
}

function AdminLoadingState() {
  return <AppStateCard as="div" className="admin-state-card" tone="loading" title="Cargando suministros" description="Estamos consultando información operativa." />;
}

function AdminErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppStateCard as="div" className="admin-state-card" tone="error" title="No pudimos cargar los suministros" description={message} action={{ label: "Reintentar", onClick: onRetry, variant: "secondary" }} />;
}

function AdminInlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <AppStateCard tone="error" layout="inline" className="admin-inline-error" title="No pudimos actualizar los suministros" description={message} action={{ label: "Reintentar", onClick: onRetry, variant: "secondary" }} />;
}

function DebtorItem({ debtor, position, selected, checked, onSelect, onToggle }: { debtor: DebtorRecord; position: number; selected: boolean; checked: boolean; onSelect: () => void; onToggle: () => void }) {
  return <article className={selected ? "admin-record admin-record--selected" : "admin-record"}>
    <span className="record-position" aria-hidden="true">{position}</span>
    <label className="record-select" title="Seleccionar para lote"><input type="checkbox" checked={checked} onChange={onToggle} /><span className="sr-only">Lote</span></label>
    <div className="record-review" role="button" tabIndex={0} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }}><span className="record-identity"><strong>{debtor.customerName}</strong><small>Cuenta {debtor.accountId} · Medidor {debtor.meterId}</small></span><span className="record-address"><strong>{debtor.address || `${debtor.locality}`}</strong><small>Ruta {debtor.routeName ?? debtor.route}</small></span><span className="record-debt"><b>Bs {formatAdminMoney(debtor.debtCents)}</b><small>{debtor.monthsPending} facturas</small></span><span className="record-state">{debtor.supplyStatus ?? "Estado no disponible"}</span></div>
  </article>;
}

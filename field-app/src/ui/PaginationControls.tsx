export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function PaginationControls({ page, totalPages, onPrevious, onNext, disabled = false, className, label = "Paginación" }: PaginationControlsProps) {
  return (
    <nav className={["ui-pagination", className].filter(Boolean).join(" ")} aria-label={label}>
      <button type="button" onClick={onPrevious} disabled={disabled || page <= 1}>Anterior</button>
      <span aria-live="polite" aria-atomic="true">Página {page} de {totalPages}</span>
      <button type="button" onClick={onNext} disabled={disabled || page >= totalPages}>Siguiente</button>
    </nav>
  );
}

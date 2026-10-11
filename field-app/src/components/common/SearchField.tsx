import { IconSearch } from "./Icons";

export interface SearchFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}

export function SearchField({ id, label, value, onChange, placeholder, onClear, disabled = false, busy = false, className }: SearchFieldProps) {
  return (
    <div className={["ui-search-field", "search-bar-wrap", className].filter(Boolean).join(" ")} aria-busy={busy || undefined}>
      <label className="search-field" htmlFor={id}>
        <IconSearch className="search-field-icon" />
        <input id={id} type="search" aria-label={label} value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} disabled={disabled} />
      </label>
      {value ? <button type="button" className="search-clear-btn" onClick={() => { if (!disabled) (onClear ?? (() => onChange("")))(); }} disabled={disabled} aria-label="Limpiar búsqueda" aria-controls={id}>×</button> : null}
    </div>
  );
}

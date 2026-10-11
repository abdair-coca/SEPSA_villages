/** Marca SEPSA con el nombre del área; se comparte entre login y encabezado. */
export function BrandLockup({ area }: { area: string }) {
  return <div className="app-brand"><strong>SEPSA</strong><span>{area}</span></div>;
}

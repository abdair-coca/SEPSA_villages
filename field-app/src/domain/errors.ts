/**
 * Error de regla de negocio. `code` es estable (p. ej. `ORDER_NOT_ASSIGNED`) y es lo que deben comparar
 * los llamadores; `message` es solo descriptivo.
 */
export class DomainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "DomainError";
  }
}

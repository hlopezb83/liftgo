const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * R9 (defensa): valida el formato de un UUID antes de usarlo en un filtro
 * `.eq("id", id)`. Evita mandar segmentos de ruta no-UUID (p. ej. "new" en
 * `/customers/:id`) a Postgres, que respondía con un error SQL crudo de tipo
 * UUID inválido y disparaba varios toasts de error en cascada.
 */
export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

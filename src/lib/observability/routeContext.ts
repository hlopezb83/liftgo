/**
 * Utilidades puras para derivar el "flow" (módulo) y una versión sanitizada
 * de la ruta a partir del pathname actual. Se usa como request-context en
 * Sentry para que cada error incluya el módulo del ERP donde ocurrió sin
 * fugar IDs de negocio (folios, UUID de facturas, etc.) en las etiquetas.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_RE = /^\d+$/;
// Folios de negocio: FAC-0094, RSV-0022, COT-0001, ENT-, DEV-, CTR-, BORRADOR-, etc.
const DOC_FOLIO_RE = /^[A-Z]{2,10}-\d{2,}$/;

/**
 * Sustituye segmentos que aparentan ser identificadores por `:id`.
 * Preserva el primer segmento y las palabras clave del ERP para que la
 * agrupación en Sentry sea legible (`/facturas/:id/editar`).
 */
export function sanitizeRoute(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const parts = pathname.split("/").map((seg) => {
    if (!seg) return seg;
    if (UUID_RE.test(seg)) return ":id";
    if (NUMERIC_ID_RE.test(seg)) return ":id";
    if (DOC_FOLIO_RE.test(seg)) return ":folio";
    return seg;
  });
  return parts.join("/") || "/";
}

/**
 * Deriva el "flow" (módulo del ERP) del pathname. Sólo el primer segmento
 * — nunca IDs — para que la etiqueta tenga cardinalidad baja en Sentry.
 */
export function deriveFlow(pathname: string): string {
  if (!pathname || pathname === "/") return "root";
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return "root";
  if (UUID_RE.test(first) || NUMERIC_ID_RE.test(first)) return "root";
  return first;
}

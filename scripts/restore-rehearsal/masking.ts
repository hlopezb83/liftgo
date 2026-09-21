/**
 * Enmascarado de identificadores. El reporte del ensayo nunca debe contener
 * UUID, nombres, correos, rutas de Storage ni ningún dato personal: sólo
 * etiquetas estables (ORG-001, ORG-002, …) y agregados numéricos.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Construye etiquetas deterministas ORG-001… a partir de identificadores reales. */
export function buildOrgLabels(ids: readonly string[]): Map<string, string> {
  const unique = Array.from(new Set(ids.map((id) => String(id)))).sort();
  const labels = new Map<string, string>();
  unique.forEach((id, index) => {
    labels.set(id, `ORG-${String(index + 1).padStart(3, "0")}`);
  });
  return labels;
}

/** Devuelve la etiqueta de un identificador; ORG-UNK si no está mapeado. */
export function labelFor(labels: Map<string, string>, id: string | null | undefined): string {
  if (id === null || id === undefined) return "ORG-UNK";
  return labels.get(String(id)) ?? "ORG-UNK";
}

/**
 * Detecta si un texto serializado contiene datos que no deben publicarse.
 * Se usa como red de seguridad antes de escribir los reportes.
 */
export function findSensitiveLeak(serialized: string): string | null {
  if (UUID_RE.test(serialized)) return "uuid";
  if (EMAIL_RE.test(serialized)) return "email";
  if (/postgres(ql)?:\/\//i.test(serialized)) return "dsn";
  if (/\beyJ[A-Za-z0-9_-]{10,}/.test(serialized)) return "jwt";
  return null;
}

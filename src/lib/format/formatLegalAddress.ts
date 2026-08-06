/**
 * v7.282.0 · Normaliza domicilios provenientes de la Constancia de Situación
 * Fiscal (CSF) para imprimirlos en documentos legales (contrato, pagaré).
 *
 * El texto crudo del SAT llega así:
 *   "CAZADORES AVENIDA (AV.) 223 , OTRA NO ESPECIFICADA EN EL CATALOGO, SANTA CATARINA, NUEVO LEON"
 * y debe leerse:
 *   "AVENIDA CAZADORES 223, SANTA CATARINA, NUEVO LEON, C.P. 66359"
 *
 * No modifica el dato guardado del cliente: sólo la presentación.
 */

/** Frases de relleno del catálogo del SAT que no aportan al domicilio. */
const CATALOG_NOISE = [
  /OTRA\s+NO\s+ESPECIFICADA\s+EN\s+EL\s+CAT[AÁ]LOGO/i,
  /NO\s+ESPECIFICAD[OA]\s+EN\s+EL\s+CAT[AÁ]LOGO/i,
  /^NINGUN[OA]$/i,
  /^N\/?A$/i,
  /^SIN\s+(NOMBRE|COLONIA|NUMERO|N[UÚ]MERO)$/i,
  /^-+$/,
];

/** Tipos de vialidad del SAT que aparecen pospuestos al nombre de la calle. */
const VIALIDAD_RE =
  /^(.+?)\s+(AVENIDA|CALLE|BOULEVARD|BULEVAR|CALZADA|CARRETERA|PRIVADA|PROLONGACION|PROLONGACIÓN|ANDADOR|CERRADA|CAMINO|EJE|CIRCUITO|VIADUCTO|PERIFERICO|PERIFÉRICO|RETORNO|PASEO)(\s*\([^)]*\))?\s*(.*)$/i;

function isNoise(part: string): boolean {
  return part === "" || CATALOG_NOISE.some((re) => re.test(part));
}

/**
 * "CAZADORES AVENIDA (AV.) 223" → "AVENIDA CAZADORES 223".
 * Si no detecta un tipo de vialidad pospuesto, devuelve el texto tal cual.
 */
function reorderVialidad(part: string): string {
  const m = VIALIDAD_RE.exec(part);
  if (!m) return part;
  const [, nombre, tipo, , resto] = m;
  return [tipo.toUpperCase(), nombre.trim(), resto.trim()].filter(Boolean).join(" ").trim();
}

export interface LegalAddressOptions {
  /** Código postal fiscal; se agrega al final si no viene ya en el texto. */
  cp?: string | null;
}

export function formatLegalAddress(
  raw: string | null | undefined,
  options: LegalAddressOptions = {},
): string {
  if (!raw || !raw.trim()) return "";

  const parts = raw
    .split(",")
    .map((p) => p.replace(/\s{2,}/g, " ").trim())
    .filter((p) => !isNoise(p));

  if (parts.length === 0) return "";

  const normalized = [reorderVialidad(parts[0]), ...parts.slice(1)].join(", ");
  const clean = normalized.replace(/\s{2,}/g, " ").replace(/[.,;\s]+$/g, "").trim();

  const cp = options.cp?.trim();
  if (cp && !/\b(C\.?\s*P\.?|CP)\s*\d{5}\b/i.test(clean) && !clean.includes(cp)) {
    return `${clean}, C.P. ${cp}`;
  }
  return clean;
}

/**
 * R6 A4B-08: catálogo SAT c_RegimenFiscal (CFDI 4.0) del lado servidor.
 *
 * El fail-fast real vive aquí: antes de llamar al PAC validamos que el
 * régimen fiscal sea un código de 3 dígitos del catálogo vigente. Sin esto,
 * un valor con descripción ("601 - General de Ley…") llegaba crudo a
 * Facturapi y provocaba rechazo del PAC o un dato fiscal inválido.
 */

export const REGIMEN_FISCAL_CODES: ReadonlySet<string> = new Set([
  "601",
  "603",
  "605",
  "606",
  "607",
  "608",
  "610",
  "611",
  "612",
  "614",
  "615",
  "616",
  "620",
  "621",
  "622",
  "623",
  "624",
  "625",
  "626",
]);

/** true si el valor es exactamente un código válido del catálogo SAT. */
export function isValidRegimenFiscalCode(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return /^\d{3}$/.test(v) && REGIMEN_FISCAL_CODES.has(v);
}

/**
 * Normaliza valores tolerables (p.ej. "601 - General de Ley…", " 601 ") al
 * código puro. Devuelve null si no se puede derivar un código válido.
 * Se usa solo en captura (parse-csf), NUNCA para relajar el timbrado.
 */
export function normalizeRegimenFiscal(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const match = v.match(/^(\d{3})/);
  if (!match) return null;
  return REGIMEN_FISCAL_CODES.has(match[1]) ? match[1] : null;
}

/**
 * A4-05: validación del dígito verificador del RFC (SAT).
 *
 * El regex de formato acepta RFCs inventados (p. ej. "AAAA010101AAA"). El SAT
 * calcula el último carácter (dígito verificador) a partir de los anteriores,
 * así que validarlo detecta capturas mal tecleadas antes de timbrar.
 *
 * Referencia: "Algoritmo para la generación del RFC" (Anexo 20 / IFAI).
 */

const DICT = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";

/** RFCs genéricos válidos por definición (público en general / extranjeros). */
const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"]);

function charValue(c: string): number {
  const idx = DICT.indexOf(c);
  return idx === -1 ? 0 : idx;
}

/**
 * Devuelve true si el dígito verificador del RFC es consistente.
 * No valida el formato: úsalo después del regex correspondiente.
 */
export function hasValidRfcChecksum(rfcRaw: string): boolean {
  const rfc = rfcRaw.trim().toUpperCase();
  if (rfc.length !== 12 && rfc.length !== 13) return false;
  if (GENERIC_RFCS.has(rfc)) return true;

  // Las personas morales (12) se alinean a 13 con un espacio inicial.
  const padded = rfc.length === 12 ? ` ${rfc}` : rfc;
  const body = padded.slice(0, 12);
  const expected = padded.slice(12);

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += charValue(body[i]) * (13 - i);
  }
  const value = 11 - (sum % 11);
  const digit = value === 11 ? "0" : value === 10 ? "A" : String(value);
  return digit === expected;
}

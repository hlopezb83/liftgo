/**
 * A4-05: validación del dígito verificador del RFC (SAT) en el servidor.
 *
 * Espejo de `src/lib/fiscal/rfcChecksum.ts`. Las edge functions no pueden
 * importar desde `src/`, por eso la lógica se duplica aquí; cualquier cambio
 * debe aplicarse en ambos archivos.
 */

const DICT = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";

/** RFCs genéricos válidos por definición (público en general / extranjeros). */
const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"]);

const RFC_FORMAT = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

function charValue(c: string): number {
  const idx = DICT.indexOf(c);
  return idx === -1 ? 0 : idx;
}

/** true si el dígito verificador del RFC es consistente (no valida formato). */
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

/**
 * Devuelve `null` si el RFC es válido (formato + dígito verificador) o el
 * mensaje de error listo para regresar al cliente.
 */
export function validateRfcOrMessage(rfcRaw: string): string | null {
  const rfc = String(rfcRaw ?? "").trim().toUpperCase();
  if (!rfc) return "El RFC del receptor es obligatorio para timbrar.";
  if (!RFC_FORMAT.test(rfc)) {
    return `El RFC "${rfc}" no tiene un formato válido del SAT.`;
  }
  if (!hasValidRfcChecksum(rfc)) {
    return `El RFC "${rfc}" no pasa la validación del dígito verificador del SAT; corrígelo en el cliente antes de timbrar.`;
  }
  return null;
}

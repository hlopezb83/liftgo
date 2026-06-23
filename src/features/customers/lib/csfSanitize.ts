/**
 * Limpia un nombre proveniente de la CSF para usarlo como razón social CFDI 4.0:
 * - Mayúsculas sin acentos
 * - Sin sufijo de régimen societario (S.A. de C.V., S. de R.L., SAPI, etc.)
 * - Sin puntuación final ni espacios duplicados
 *
 * Defensa en cliente, complementa el saneo en el prompt del modelo y en
 * supabase/functions/stamp-cfdi/handler.ts.
 */
const SUFFIX_RE =
  /[,\s]+(SOCIEDAD\s+AN[OÓ]NIMA(\s+BURS[AÁ]TIL)?(\s+PROMOTORA\s+DE\s+INVERSI[OÓ]N)?(\s+DE\s+CAPITAL\s+VARIABLE)?|SOCIEDAD\s+DE\s+RESPONSABILIDAD\s+LIMITADA(\s+DE\s+CAPITAL\s+VARIABLE)?|SOCIEDAD\s+CIVIL|ASOCIACI[OÓ]N\s+CIVIL|S\.?\s*A\.?\s*B\.?\s*(DE\s+C\.?\s*V\.?)?|S\.?\s*A\.?\s*P\.?\s*I\.?\s*(DE\s+C\.?\s*V\.?)?|SAPI(\s+DE\s+C\.?\s*V\.?)?|S\.?\s*A\.?(\s+DE\s+C\.?\s*V\.?)?|S\.?\s*DE\s+R\.?\s*L\.?(\s+DE\s+C\.?\s*V\.?)?|S\.?\s*C\.?|A\.?\s*C\.?)\.?\s*$/i;

export function sanitizeCsfName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
  // Aplica varias veces por si quedan sufijos encadenados (raro pero seguro).
  for (let i = 0; i < 3; i++) {
    const next = s.replace(SUFFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[.,;:\s]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Sanea una razón social para CFDI 4.0: sin acentos, en mayúsculas,
 * sin régimen societario (S.A. de C.V., S. de R.L., SAPI, etc.) y sin
 * puntuación final. Coincide con la razón social registrada en el SAT.
 *
 * Fuente única de verdad: consumida por stamp-cfdi, stamp-credit-note y
 * validate-receptor-tax-info. Mantener en _shared evita duplicación y
 * problemas de bundling cross-función.
 */
export function sanitizeLegalName(raw: string): string {
  const SUFFIX_RE =
    /\b(S\.?\s*A\.?\s*(DE\s*C\.?\s*V\.?)?|S\.?\s*DE\s*R\.?\s*L\.?\s*(DE\s*C\.?\s*V\.?)?|S\.?\s*C\.?|S\.?\s*A\.?\s*P\.?\s*I\.?\s*(DE\s*C\.?\s*V\.?)?|S\.?\s*A\.?\s*S\.?|A\.?\s*C\.?|S\.?\s*A\.?\s*B\.?\s*(DE\s*C\.?\s*V\.?)?)\b\.?/g;
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(SUFFIX_RE, "")
    .replace(/[,.;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

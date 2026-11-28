/**
 * Sanea una razón social para CFDI 4.0: sin acentos, en mayúsculas,
 * sin régimen societario (S.A. de C.V., S. de R.L., SAPI, SAS, regímenes
 * completos de la CSF, etc.) anclado al final y sin puntuación final.
 *
 * Fuente única de verdad compartida entre Edge Functions (`_shared`) y UI
 * (`src/features/customers/lib/csfSanitize.ts`).
 */
const DE_CV = "(?:(?:[,\\s]+|(?<=\\.))DE\\s+C\\.?\\s*V\\.?)?";
const DE_CAP_VAR = "(?:[,\\s]+DE\\s+CAPITAL\\s+VARIABLE)?";

const REGIME_PATTERNS = [
  `SOCIEDAD\\s+ANONIMA(?:\\s+BURSATIL)?(?:\\s+PROMOTORA\\s+DE\\s+INVERSION)?${DE_CAP_VAR}`,
  `SOCIEDAD\\s+DE\\s+RESPONSABILIDAD\\s+LIMITADA${DE_CAP_VAR}`,
  `SOCIEDAD\\s+POR\\s+ACCIONES\\s+SIMPLIFICADA${DE_CAP_VAR}`,
  "SOCIEDAD\\s+CIVIL",
  "ASOCIACION\\s+CIVIL",
  `S\\.?\\s*A\\.?\\s*B\\.?${DE_CV}`,
  `S\\.?\\s*A\\.?\\s*P\\.?\\s*I\\.?${DE_CV}`,
  `SAPI${DE_CV}`,
  `S\\.?\\s*A\\.?\\s*S\\.?${DE_CV}`,
  `S\\.?\\s*DE\\s*R\\.?\\s*L\\.?${DE_CV}`,
  `S\\.?\\s*A\\.?${DE_CV}`,
  "S\\.?\\s*C\\.?",
  "A\\.?\\s*C\\.?",
];

const SUFFIX_RE = new RegExp(
  `[.,;:\\s]+(?:${REGIME_PATTERNS.join("|")})[.,;:\\s]*$`,
  "i",
);

export function sanitizeLegalName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  for (let i = 0; i < 3; i++) {
    const next = s.replace(SUFFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[.,;:\s]+$/g, "").replace(/\s+/g, " ").trim();
}

export const sanitizeCsfName = sanitizeLegalName;

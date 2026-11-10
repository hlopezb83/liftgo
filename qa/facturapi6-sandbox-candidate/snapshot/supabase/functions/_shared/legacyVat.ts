/** Reject obsolete VAT on NEW sales documents, never rewrite historical rates.
 * Related historical credit notes/REP are intentionally outside this policy.
 */
export const LEGACY_VAT_MESSAGE =
  "La tasa de IVA del 11% es obsoleta. Selecciona explícitamente una tasa vigente antes de crear o emitir el documento.";

export function hasLegacyVat(
  document: { tax_rate?: unknown; line_items?: unknown },
): boolean {
  const isLegacy = (value: unknown) =>
    (typeof value === "number" || typeof value === "string") &&
    Number(value) === 11;
  return isLegacy(document.tax_rate) ||
    (Array.isArray(document.line_items) && document.line_items.some(
      (line) =>
        line != null && typeof line === "object" && isLegacy(line.tax_rate),
    ));
}

export function assertNoLegacyVat(
  document: { tax_rate?: unknown; line_items?: unknown },
): void {
  if (hasLegacyVat(document)) throw new Error(LEGACY_VAT_MESSAGE);
}

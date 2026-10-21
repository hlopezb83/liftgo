/** UI policy only: calculations and historical readers must preserve 11%. */
export const LEGACY_VAT_MESSAGE = "La tasa de IVA del 11% es obsoleta. Selecciona explícitamente una tasa vigente antes de crear o emitir el documento.";
export const isNotObsoleteVat = (rate: unknown) => Number(rate) !== 11;
export function hasLegacyVat(document: { tax_rate?: unknown; line_items?: unknown }): boolean {
  return !isNotObsoleteVat(document.tax_rate) || (Array.isArray(document.line_items) && document.line_items.some(
    (line) => line != null && typeof line === "object" && !isNotObsoleteVat(line.tax_rate),
  ));
}

export function sameFiscalLines(left: unknown, right: unknown): boolean {
  // JSON invokes Date.toJSON before the replacer; dates must not collapse to {}.
  const serialize = (value: unknown) => JSON.stringify(value, (_key, item) =>
    item != null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
  return serialize(left) === serialize(right);
}
export function legacyVatNeedsCorrection(
  current: { tax_rate?: unknown; line_items?: unknown },
  previous?: { tax_rate?: unknown; line_items?: unknown },
): boolean {
  return hasLegacyVat(current) && (!previous || Number(current.tax_rate) !== Number(previous.tax_rate)
    || !sameFiscalLines(current.line_items, previous.line_items));
}

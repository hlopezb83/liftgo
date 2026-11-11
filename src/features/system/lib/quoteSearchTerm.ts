/** Normalize folios without numeric conversion (large folios must stay exact). */
export function normalizeQuoteNumber(term: string): string | undefined {
  const match = /^(?:COT-)?(\d+)$/i.exec(term.trim());
  if (!match) return undefined;
  const digits = match[1].replace(/^0+(?=\d)/, "");
  return `COT-${digits.padStart(4, "0")}`;
}

/** Normalize folios without numeric conversion (large folios must stay exact). */
export function normalizeQuoteNumber(term: string): string | undefined {
  const match = /^(?:COT-)?(\d+)$/i.exec(term.trim());
  if (!match) return undefined;
  const digits = match[1].replace(/^0+(?=\d)/, "");
  return `COT-${digits.padStart(4, "0")}`;
}

function quoteLogicValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

/** Escape SQL LIKE wildcards before quoting the PostgREST logic value. */
export function quoteSearchPattern(term: string): string {
  return quoteLogicValue(`%${term.trim().replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
}

export function quoteSearchFilter(term: string): string {
  // PostgREST rewrites every '*' in LIKE patterns to '%', even escaped ones.
  // For literal stars use its case-insensitive regex operator, escaping every
  // regex metacharacter. Normal terms keep the existing ILIKE search semantics.
  const hasStar = term.includes("*");
  const operator = hasStar ? "imatch" : "ilike";
  const pattern = hasStar
    ? quoteLogicValue(term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    : quoteSearchPattern(term);
  return `quote_number.${operator}.${pattern},customer_name.${operator}.${pattern}`;
}

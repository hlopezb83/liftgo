/** Quote a PostgREST logic value after escaping literal SQL/regex metacharacters. */
export function crmQuoteSearchFilter(term: string): string {
  const quote = (value: string) => `"${value.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
  // PostgREST translates '*' to '%' in LIKE patterns, so literal stars require regex.
  const hasStar = term.includes("*");
  const operator = hasStar ? "imatch" : "ilike";
  const pattern = hasStar
    ? quote(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    : quote(`%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
  return `quote_number.${operator}.${pattern},customer_name.${operator}.${pattern}`;
}

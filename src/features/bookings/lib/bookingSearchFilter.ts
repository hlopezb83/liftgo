/** Preserve literal customer names/folios without treating punctuation as filter syntax. */
export function bookingSearchFilter(term: string): string {
  const quote = (value: string) => `"${value.replace(/[\\"]/g, character => `\\${character}`)}"`;
  // PostgREST treats stars as LIKE wildcards; regex preserves a literal star.
  const hasStar = term.includes("*");
  const operator = hasStar ? "imatch" : "ilike";
  const pattern = hasStar
    ? quote(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    : quote(`%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`);
  return `customer_name.${operator}.${pattern},booking_number.${operator}.${pattern}`;
}

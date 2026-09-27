type QuoteSource = {
  organization_id: string;
  line_items: unknown;
  rental_meta: unknown;
};

/** Never generate gross rental charges when the accepted quote contains discounts. */
export function recurringQuoteIssue(
  quoteId: string | null,
  organizationId: string,
  source: QuoteSource | QuoteSource[] | null,
): "quote_discount_review" | "quote_source_missing" | null {
  if (!quoteId) return null;
  const quote = Array.isArray(source)
    ? (source.length === 1 ? source[0] : null)
    : source;
  if (
    !quote || quote.organization_id !== organizationId ||
    !Array.isArray(quote.line_items)
  ) {
    return "quote_source_missing";
  }
  const rows = [
    ...quote.line_items,
    ...(Array.isArray(quote.rental_meta) ? quote.rental_meta : []),
  ];
  return rows.some((row) =>
      row && typeof row === "object" && Number(row.discount) > 0
    )
    ? "quote_discount_review"
    : null;
}

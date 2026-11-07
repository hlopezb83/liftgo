import { supabase } from "@/integrations/supabase/client";
import { normalizeQuoteNumber, quoteSearchFilter } from "../lib/quoteSearchTerm";

interface QuoteRow {
  id: string;
  quote_number: string | null;
  customer_name: string | null;
}

/** Preserve successful sections even if a request rejects instead of returning an error. */
export async function settleSearch<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  try {
    return await query;
  } catch {
    return { data: null, error: { message: "No se pudo completar la búsqueda." } };
  }
}

export async function searchQuotes(query: string, organizationId: string) {
  const normalized = normalizeQuoteNumber(query);
  const filter = quoteSearchFilter(query);
  // Both requests must have the same tenant and demo-data boundaries. Keep
  // exact lookup separate: five newer broad matches must not hide an old folio.
  const scopedQuery = () => supabase
    .from("quotes")
    .select("id, quote_number, customer_name")
    .eq("organization_id", organizationId)
    .or("is_e2e.is.null,is_e2e.eq.false")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const [exact, broad] = await Promise.all([
    normalized ? settleSearch(scopedQuery().eq("quote_number", normalized).limit(5)) : undefined,
    settleSearch(scopedQuery().or(filter).limit(5)),
  ]);
  const results = exact ? [exact, broad] : [broad];
  const rows = new Map<string, QuoteRow>();
  for (const result of results) {
    if (result.error) continue;
    for (const row of result.data ?? []) {
      if (!rows.has(row.id)) rows.set(row.id, row);
    }
  }
  return {
    results,
    hits: [...rows.values()].slice(0, 5).map((row) => ({
      id: row.id,
      label: row.quote_number ?? "—",
      sub: row.customer_name ?? undefined,
      url: `/quotes/${row.id}`,
    })),
  };
}

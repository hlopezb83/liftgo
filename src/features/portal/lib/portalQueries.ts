import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import type {
  PortalCollectionAccount,
  PortalQuoteDetailRow,
  PortalQuoteListRow,
} from "./queryKeys";

/**
 * Evita que supabase-js parse el string de `.select(...)` a nivel de tipos.
 * Usado junto con `.returns<T>()` según la guía de performance del query builder.
 */
const sel = (s: string): string => s;

const QUOTE_LIST_COLUMNS = sel(
  "id, quote_number, status, valid_until, total, currency, created_at",
);

const QUOTE_DETAIL_COLUMNS = sel(
  "id, quote_number, status, valid_until, total, currency, created_at, subtotal, tax_rate, tax_amount, line_items, accepted_at",
);

const portalQuotesQueries = defineEntityQueries<
  "portal_quotes",
  PortalQuoteListRow[],
  PortalQuoteDetailRow | null
>("portal_quotes", {
  staleTime: 60_000,
  list: () => async () => {
    const { data, error } = await supabase
      .from("quotes")
      .select(QUOTE_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .returns<PortalQuoteListRow[]>();
    if (error) throw error;
    return data ?? [];
  },
  detail: (id: string) => async () => {
    const { data, error } = await supabase
      .from("quotes")
      .select(QUOTE_DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .returns<PortalQuoteDetailRow>();
    if (error) throw error;
    return data;
  },
});

const portalCollectionAccountQueries = defineEntityQueries<
  "portal_collection_account",
  PortalCollectionAccount | null,
  never
>("portal_collection_account", {
  staleTime: 5 * 60_000,
  list: () => async () => {
    const data = await callRpc<PortalCollectionAccount[] | null>(
      "get_portal_collection_account",
    );
    return (data ?? [])[0] ?? null;
  },
});

export const portalQueries = {
  quotes: portalQuotesQueries,
  collectionAccount: portalCollectionAccountQueries,
} as const;

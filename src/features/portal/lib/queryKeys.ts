/**
 * Query keys y query definitions para la feature `portal`.
 *
 * Los payment intents viven en `@/features/invoices/lib/paymentIntentsQueryKeys`
 * (donde son consumidos) para evitar el ciclo `invoices → portal`.
 */
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

/**
 * Evita que supabase-js parse el string de `.select(...)` a nivel de tipos.
 * Usado junto con `.returns<T>()` según la guía de performance del query builder.
 */
const sel = (s: string): string => s;

export interface PortalQuoteListRow {
  id: string;
  quote_number: string;
  status: string;
  valid_until: string | null;
  total: number;
  currency: string;
  created_at: string;
}

export interface PortalQuoteDetailRow extends PortalQuoteListRow {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  line_items: unknown[] | null;
  accepted_at: string | null;
}

export interface PortalCollectionAccount {
  bank: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  currency: string | null;
}

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

/**
 * Agrupa las definiciones de queries de la feature `portal`.
 *
 * Uso:
 *   useQuery(portalQueries.quotes.list());
 *   useQuery(portalQueries.quotes.detail(id));
 *   useQuery(portalQueries.collectionAccount.list());
 *
 * Para payment intents ver `@/features/invoices/lib/paymentIntentsQueryKeys`.
 */
export const portalQueries = {
  quotes: portalQuotesQueries,
  collectionAccount: portalCollectionAccountQueries,
} as const;

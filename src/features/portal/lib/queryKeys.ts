/**
 * Query keys y query definitions para la feature `portal`.
 *
 * Reemplaza las tuplas ad-hoc (`["portal_quotes", ...]`, `["portal_quote", ...]`,
 * `["portal_collection_account"]`, `["portal_payment_intents", ...]`,
 * `["admin_payment_intents", ...]`) por el idiom oficial `createEntityKeys` +
 * `defineEntityQueries`, evitando invalidaciones rotas por typos o segmentos
 * faltantes.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

/** Root genérico de la feature, útil para invalidaciones amplias. */
const portalKeys = createEntityKeys("portal");

export type PortalQuote = Tables<"quotes">;
export type PortalPaymentIntent = Tables<"customer_payment_intents">;

export interface PortalCollectionAccount {
  bank: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  currency: string | null;
}

const portalQuotesQueries = defineEntityQueries<"portal_quotes", PortalQuote[], PortalQuote | null>(
  "portal_quotes",
  {
    staleTime: 60_000,
    list: () => async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    detail: (id: string) => async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  },
);

const portalCollectionAccountQueries = defineEntityQueries<
  "portal_collection_account",
  PortalCollectionAccount | null,
  never
>("portal_collection_account", {
  staleTime: 5 * 60_000,
  list: () => async () => {
    const data = await callRpc<PortalCollectionAccount[] | null>("get_portal_collection_account");
    return (data ?? [])[0] ?? null;
  },
});

async function fetchPaymentIntents(invoiceId: string | undefined): Promise<PortalPaymentIntent[]> {
  const { data, error } = await supabase
    .from("customer_payment_intents")
    .select("*")
    .eq("invoice_id", invoiceId ?? "")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

const portalPaymentIntentsQueries = defineEntityQueries<
  "portal_payment_intents",
  PortalPaymentIntent[],
  never
>("portal_payment_intents", {
  staleTime: 30_000,
  list: (filter) => () => fetchPaymentIntents(filter?.invoiceId as string | undefined),
});

const adminPaymentIntentsQueries = defineEntityQueries<
  "admin_payment_intents",
  PortalPaymentIntent[],
  never
>("admin_payment_intents", {
  staleTime: 30_000,
  list: (filter) => () => fetchPaymentIntents(filter?.invoiceId as string | undefined),
});

/**
 * Agrupa las definiciones de queries de toda la feature `portal`.
 *
 * Uso:
 *   useQuery(portalQueries.quotes.list());
 *   useQuery(portalQueries.quotes.detail(id));
 *   useQuery(portalQueries.collectionAccount.list());
 *   useQuery(portalQueries.paymentIntents.list({ invoiceId }));
 *   useQuery(portalQueries.adminPaymentIntents.list({ invoiceId }));
 */
export const portalQueries = {
  quotes: portalQuotesQueries,
  collectionAccount: portalCollectionAccountQueries,
  paymentIntents: portalPaymentIntentsQueries,
  adminPaymentIntents: adminPaymentIntentsQueries,
} as const;

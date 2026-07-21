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
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import type { PaymentIntentStatus } from "@/lib/domain/paymentIntentStatus";

/**
 * Evita que supabase-js parse el string de `.select(...)` a nivel de tipos.
 * Usado junto con `.returns<T>()` según la guía de performance del query builder.
 */
const sel = (s: string): string => s;

/**
 * Campos mínimos de cotización expuestos al portal de clientes (listado).
 * Excluye datos internos como rental_meta, line_items, assigned_by, notas
 * administrativas y campos de aceptación que no se muestran en la tabla.
 */
export interface PortalQuoteListRow {
  id: string;
  quote_number: string;
  status: string;
  valid_until: string | null;
  total: number;
  currency: string;
  created_at: string;
}

/**
 * Campos de cotización para la vista de detalle del portal.
 * Incluye partidas (line_items) y desglose fiscal necesarios para renderizar
 * el desglose y el botón de aceptación/rechazo.
 */
export interface PortalQuoteDetailRow extends PortalQuoteListRow {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  line_items: unknown[] | null;
  accepted_at: string | null;
}

/**
 * Campos mínimos de un intento de pago vistos por el cliente en el portal.
 */
export interface PortalPaymentIntentRow {
  id: string;
  invoice_id: string;
  customer_id: string;
  amount: number;
  transfer_date: string;
  tracking_key: string | null;
  status: PaymentIntentStatus;
}

/**
 * Campos adicionales que el admin necesita para revisar un intento de pago.
 */
export interface AdminPaymentIntentRow extends PortalPaymentIntentRow {
  sender_bank: string | null;
  sender_last4: string | null;
  proof_url: string | null;
  review_notes: string | null;
}

export interface PortalCollectionAccount {
  bank: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  currency: string | null;
}

const QUOTE_LIST_COLUMNS =
  sel("id, quote_number, status, valid_until, total, currency, created_at");

const QUOTE_DETAIL_COLUMNS =
  sel("id, quote_number, status, valid_until, total, currency, created_at, subtotal, tax_rate, tax_amount, line_items, accepted_at");

const PAYMENT_INTENT_PORTAL_COLUMNS =
  sel("id, invoice_id, customer_id, amount, transfer_date, tracking_key, status");

const PAYMENT_INTENT_ADMIN_COLUMNS =
  sel("id, invoice_id, customer_id, amount, transfer_date, tracking_key, status, sender_bank, sender_last4, proof_url, review_notes");

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
    const data = await callRpc<PortalCollectionAccount[] | null>("get_portal_collection_account");
    return (data ?? [])[0] ?? null;
  },
});

async function fetchPaymentIntents(
  invoiceId: string | undefined,
  admin: boolean,
): Promise<PortalPaymentIntentRow[] | AdminPaymentIntentRow[]> {
  const columns = admin ? PAYMENT_INTENT_ADMIN_COLUMNS : PAYMENT_INTENT_PORTAL_COLUMNS;
  const { data, error } = await supabase
    .from("customer_payment_intents")
    .select(columns)
    .eq("invoice_id", invoiceId ?? "")
    .order("created_at", { ascending: false })
    .returns<PortalPaymentIntentRow[]>();
  if (error) throw error;
  return data ?? [];
}

const portalPaymentIntentsQueries = defineEntityQueries<
  "portal_payment_intents",
  PortalPaymentIntentRow[],
  never
>("portal_payment_intents", {
  staleTime: 30_000,
  list: (filter) => () => fetchPaymentIntents(filter?.invoiceId as string | undefined, false) as Promise<PortalPaymentIntentRow[]>,
});

const adminPaymentIntentsQueries = defineEntityQueries<
  "admin_payment_intents",
  AdminPaymentIntentRow[],
  never
>("admin_payment_intents", {
  staleTime: 30_000,
  list: (filter) => () => fetchPaymentIntents(filter?.invoiceId as string | undefined, true) as Promise<AdminPaymentIntentRow[]>,
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

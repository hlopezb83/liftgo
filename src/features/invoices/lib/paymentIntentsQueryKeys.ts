/**
 * Query definitions para `customer_payment_intents`.
 *
 * Vive en `invoices` porque son las cartas de factura las que consumen los
 * intents (revisión admin + creación desde portal). Portal re-exporta desde
 * aquí para preservar su API pública sin generar ciclo `invoices → portal`.
 */
import type { PaymentIntentStatus } from "@/features/invoices/lib/paymentIntentStatus";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

const sel = (s: string): string => s;

export interface PortalPaymentIntentRow {
  id: string;
  invoice_id: string;
  customer_id: string;
  amount: number;
  transfer_date: string;
  tracking_key: string | null;
  status: PaymentIntentStatus;
}

export interface AdminPaymentIntentRow extends PortalPaymentIntentRow {
  sender_bank: string | null;
  sender_last4: string | null;
  proof_url: string | null;
  review_notes: string | null;
}

const PAYMENT_INTENT_PORTAL_COLUMNS = sel(
  "id, invoice_id, customer_id, amount, transfer_date, tracking_key, status",
);

const PAYMENT_INTENT_ADMIN_COLUMNS = sel(
  "id, invoice_id, customer_id, amount, transfer_date, tracking_key, status, sender_bank, sender_last4, proof_url, review_notes",
);

async function fetchPaymentIntents(
  invoiceId: string | undefined,
  admin: boolean,
): Promise<PortalPaymentIntentRow[] | AdminPaymentIntentRow[]> {
  if (!invoiceId) return [];
  // v7.150.0 revocó `anon` sobre customer_payment_intents. Sin sesión, PostgREST
  // responde "permission denied" en vez de un set vacío por RLS. Evitamos el
  // request y devolvemos [] para que la UI siga rindiendo.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];
  const columns = admin ? PAYMENT_INTENT_ADMIN_COLUMNS : PAYMENT_INTENT_PORTAL_COLUMNS;
  const { data, error } = await supabase
    .from("customer_payment_intents")
    .select(columns)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .returns<PortalPaymentIntentRow[]>();
  if (error) throw error;
  return data ?? [];
}

export const paymentIntentsQueries = defineEntityQueries<
  "portal_payment_intents",
  PortalPaymentIntentRow[],
  never
>("portal_payment_intents", {
  staleTime: 30_000,
  list: (filter) => () =>
    fetchPaymentIntents(filter?.invoiceId as string | undefined, false) as Promise<
      PortalPaymentIntentRow[]
    >,
});

export const adminPaymentIntentsQueries = defineEntityQueries<
  "admin_payment_intents",
  AdminPaymentIntentRow[],
  never
>("admin_payment_intents", {
  staleTime: 30_000,
  list: (filter) => () =>
    fetchPaymentIntents(filter?.invoiceId as string | undefined, true) as Promise<
      AdminPaymentIntentRow[]
    >,
});

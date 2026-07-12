import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { invoiceKeys, paymentKeys } from "../lib/queryKeys";
import { syncInvoiceStatus } from "../lib/syncInvoiceStatus";

export type Payment = Tables<"payments">;

export const paymentQueries = defineEntityQueries<"payments", Payment[], never>("payments", {
  list: (filter) => async () => {
    const invoiceId = filter?.invoiceId as string | undefined;
    let q = supabase
      .from("payments")
      .select("*")
      .order("payment_date", { ascending: false });
    if (invoiceId) q = q.eq("invoice_id", invoiceId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
});

export function usePayments(invoiceId: string | undefined) {
  return useQuery({
    ...paymentQueries.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}

export function useCreatePayment() {
  return useEntityMutation({
    mutationFn: async (payment: TablesInsert<"payments">) => {
      const { data, error } = await supabase
        .from("payments")
        .insert(payment)
        .select()
        .single();
      if (error) throw error;
      await syncInvoiceStatus(payment.invoice_id, payment.payment_date ?? null);
      return data;
    },
    // Invalidamos por factura y todo el árbol de invoices (status se recalcula).
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "Error al registrar pago",
  });
}

export function useUpdatePayment() {
  return useEntityMutation({
    mutationFn: async ({ id, invoice_id, ...fields }: { id: string; invoice_id: string } & Partial<Omit<Payment, "id" | "created_at" | "invoice_id">>) => {
      const { data, error } = await supabase
        .from("payments")
        .update(fields)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await syncInvoiceStatus(invoice_id, null);
      return data;
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "Error al actualizar pago",
  });
}

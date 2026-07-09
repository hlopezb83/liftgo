import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncInvoiceStatus } from "../lib/syncInvoiceStatus";
import { invoiceKeys, paymentKeys } from "../lib/queryKeys";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Payment = Tables<"payments">;

export function usePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceId ? paymentKeys.byInvoice(invoiceId) : paymentKeys.all,
    enabled: !!invoiceId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId ?? "")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
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

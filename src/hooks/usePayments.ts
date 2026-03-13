import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { Tables } from "@/integrations/supabase/types";

export type Payment = Tables<"payments">;

export function usePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["payments", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId!)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useInvoicePaymentsTotal(invoiceId: string | undefined) {
  const { data: payments } = usePayments(invoiceId);
  const total = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  return total;
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Omit<Payment, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("payments")
        .insert(payment)
        .select()
        .single();
      if (error) throw error;

      const { data: allPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", payment.invoice_id);
      const totalPaid = (allPayments || []).reduce((s: number, p) => s + Number(p.amount), 0);

      const { data: invoice } = await supabase
        .from("invoices")
        .select("total, status")
        .eq("id", payment.invoice_id)
        .single();

      if (invoice) {
        const balance = Number(invoice.total) - totalPaid;
        if (balance <= 0 && invoice.status !== "paid") {
          await supabase.from("invoices").update({ status: "paid", paid_at: payment.payment_date }).eq("id", payment.invoice_id);
        } else if (balance > 0 && totalPaid > 0 && invoice.status !== "partial") {
          await supabase.from("invoices").update({ status: "partial" }).eq("id", payment.invoice_id);
        }
      }

      return data;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["payments", vars.invoice_id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

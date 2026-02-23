import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

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
      return data as unknown as Payment[];
    },
  });
}

export function useInvoicePaymentsTotal(invoiceId: string | undefined) {
  const { data: payments } = usePayments(invoiceId);
  const total = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  return total;
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Omit<Payment, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("payments")
        .insert(payment as any)
        .select()
        .single();
      if (error) throw error;

      // Check if invoice is fully paid
      const { data: allPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", payment.invoice_id);
      const totalPaid = (allPayments as any[] || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

      const { data: invoice } = await supabase
        .from("invoices")
        .select("total, status")
        .eq("id", payment.invoice_id)
        .single();

      if (invoice) {
        const balance = Number(invoice.total) - totalPaid;
        if (balance <= 0 && invoice.status !== "paid") {
          await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString().split("T")[0] }).eq("id", payment.invoice_id);
        } else if (balance > 0 && totalPaid > 0 && invoice.status !== "partial") {
          await supabase.from("invoices").update({ status: "partial" }).eq("id", payment.invoice_id);
        }
      }

      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["payments", vars.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

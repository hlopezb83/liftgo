import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncInvoiceStatus } from "@/features/invoices/lib/syncInvoiceStatus";

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Payment = Tables<"payments">;

export function usePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["payments", invoiceId],
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
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["payments", vars.invoice_id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["payments", vars.invoice_id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

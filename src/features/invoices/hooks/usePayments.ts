import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";

import type { Tables } from "@/integrations/supabase/types";

export type Payment = Tables<"payments">;

interface PaymentLite { amount: number | string; payment_date?: string }

async function fetchPaymentsSum(invoiceId: string): Promise<{ rows: PaymentLite[]; total: number }> {
  const { data } = await supabase
    .from("payments")
    .select("amount, payment_date")
    .eq("invoice_id", invoiceId);
  const rows = (data || []) as PaymentLite[];
  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  return { rows, total };
}

async function syncInvoiceStatus(invoiceId: string, paidAtFallback: string | null) {
  const { rows, total: totalPaid } = await fetchPaymentsSum(invoiceId);
  const { data: invoice } = await supabase
    .from("invoices")
    .select("total, status")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return;

  const balance = Number(invoice.total) - totalPaid;
  if (balance <= 0 && invoice.status !== "paid") {
    const latestDate = rows.reduce<string>(
      (latest, p) => (p.payment_date && p.payment_date > latest ? p.payment_date : latest),
      paidAtFallback ?? rows[0]?.payment_date ?? "",
    );
    const { data: paid, error: paidErr } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: latestDate })
      .eq("id", invoiceId)
      .select("id");
    if (paidErr) throw paidErr;
    assertRowsAffected(paid, "Marcar factura como pagada");
    return;
  }
  if (balance > 0 && totalPaid > 0 && invoice.status !== "partial") {
    const { data: partial, error: partialErr } = await supabase
      .from("invoices")
      .update({ status: "partial", paid_at: null })
      .eq("id", invoiceId)
      .select("id");
    if (partialErr) throw partialErr;
    assertRowsAffected(partial, "Marcar factura como parcial");
    return;
  }
  if (totalPaid === 0 && invoice.status !== "sent") {
    const { data: sent, error: sentErr } = await supabase
      .from("invoices")
      .update({ status: "sent", paid_at: null })
      .eq("id", invoiceId)
      .select("id");
    if (sentErr) throw sentErr;
    assertRowsAffected(sent, "Restablecer estado de factura");
  }
}

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
    mutationFn: async (payment: Omit<Payment, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("payments")
        .insert(payment)
        .select()
        .single();
      if (error) throw error;
      await syncInvoiceStatus(payment.invoice_id, payment.payment_date);
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

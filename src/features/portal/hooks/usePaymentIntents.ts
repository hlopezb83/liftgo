import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";

export function usePortalPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["portal_payment_intents", invoiceId],
    enabled: !!invoiceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_payment_intents")
        .select("*")
        .eq("invoice_id", invoiceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface PaymentIntentInput {
  invoice_id: string;
  customer_id: string;
  amount: number;
  transfer_date: string;
  sender_bank: string | null;
  sender_last4: string | null;
  tracking_key: string | null;
  proof_file: File | null;
}

export function useCreatePaymentIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentIntentInput) => {
      let proofUrl: string | null = null;
      if (input.proof_file) {
        const ext = input.proof_file.name.split(".").pop() ?? "bin";
        const path = `${input.customer_id}/${input.invoice_id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs")
          .upload(path, input.proof_file, { upsert: false });
        if (upErr) throw upErr;
        proofUrl = path;
      }
      const { error } = await supabase.from("customer_payment_intents").insert({
        invoice_id: input.invoice_id,
        customer_id: input.customer_id,
        amount: input.amount,
        transfer_date: input.transfer_date,
        sender_bank: input.sender_bank,
        sender_last4: input.sender_last4,
        tracking_key: input.tracking_key,
        proof_url: proofUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal_payment_intents"] });
      toast.success("Reporte de pago enviado. Lo revisaremos a la brevedad.");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

export function useAdminPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["admin_payment_intents", invoiceId],
    enabled: !!invoiceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_payment_intents")
        .select("*")
        .eq("invoice_id", invoiceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReviewPaymentIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      intentId: string;
      action: "approve" | "reject";
      notes?: string | null;
      invoiceId: string;
      amount: number;
      transferDate: string;
      trackingKey: string | null;
    }) => {
      const { intentId, action, notes, invoiceId, amount, transferDate, trackingKey } = params;
      if (action === "approve") {
        const { error: payErr } = await supabase.from("payments").insert({
          invoice_id: invoiceId,
          amount,
          payment_date: transferDate,
          payment_method: "transferencia",
          reference_number: trackingKey,
          notes: "Aprobado desde reporte del portal del cliente",
        });
        if (payErr) throw payErr;
      }
      const { error } = await supabase
        .from("customer_payment_intents")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          review_notes: notes ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", intentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_payment_intents"] });
      qc.invalidateQueries({ queryKey: ["invoice_payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Intento de pago actualizado");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

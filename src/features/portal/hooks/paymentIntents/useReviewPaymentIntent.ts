import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

interface ReviewParams {
  intentId: string;
  action: "approve" | "reject";
  notes?: string | null;
  invoiceId: string;
  amount: number;
  transferDate: string;
  trackingKey: string | null;
}

export function useReviewPaymentIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: ReviewParams) => {
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
      notifySuccess("Intento de pago actualizado");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

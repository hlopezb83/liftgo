import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invoiceKeys, paymentKeys } from "@/features/invoices/lib/queryKeys";
import { portalQueries } from "../../lib/queryKeys";

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
  return useEntityMutation({
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
    invalidateKeys: [portalQueries.adminPaymentIntents.keys.all, paymentKeys.all, invoiceKeys.all],
    successMsg: "Intento de pago actualizado",
    errorTitle: "Error al actualizar intento de pago",
  });
}

import { invoiceKeys, paymentKeys } from "@/features/invoices/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { portalQueries } from "../../lib/queryKeys";

interface ReviewParams {
  intentId: string;
  action: "approve" | "reject";
  notes?: string | null;
  /**
   * Forma de pago SAT (catálogo c_FormaPago). Sólo se usa al aprobar.
   * Default: "03" (transferencia electrónica), que es lo que reporta el portal.
   */
  paymentFormSat?: string;
}

/**
 * Revisa un reporte de pago del portal del cliente.
 *
 * BL-25/26 (v7.91.0): aprobar es un RPC atómico (`approve_payment_intent`) que:
 *  - Reclama el intent con `WHERE status='pending_review'` para evitar duplicados
 *    por doble clic o dos admins concurrentes.
 *  - Inserta el pago con `payment_form_sat` para poder timbrar el complemento REP.
 *  - Guarda `payment_id` en el intent para trazabilidad.
 * Rechazar usa `reject_payment_intent` con el mismo claim atómico.
 */
export function useReviewPaymentIntent() {
  return useEntityMutation({
    mutationFn: async (params: ReviewParams) => {
      const { intentId, action, notes, paymentFormSat } = params;
      if (action === "approve") {
        const { error } = await supabase.rpc("approve_payment_intent", {
          p_intent_id: intentId,
          p_payment_form_sat: paymentFormSat ?? "03",
          p_review_notes: notes ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("reject_payment_intent", {
          p_intent_id: intentId,
          p_review_notes: notes ?? null,
        });
        if (error) throw error;
      }
    },
    invalidateKeys: [portalQueries.adminPaymentIntents.keys.all, paymentKeys.all, invoiceKeys.all],
    successMsg: "Intento de pago actualizado",
    errorTitle: "Error al actualizar intento de pago",
  });
}

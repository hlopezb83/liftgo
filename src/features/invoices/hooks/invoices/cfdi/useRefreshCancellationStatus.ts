import { satStatusLabel } from "@/features/feedback";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { invoiceKeys, paymentKeys } from "../../../lib/queryKeys";

export function useRefreshCancellationStatus() {
  return useEntityMutation({
    mutationFn: async (invoiceId: string) => {
      return await invokeEdgeFunction<{ cancellation_status: string }>(
        "refresh-cancellation-status",
        { body: { invoice_id: invoiceId } },
      );
    },
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_data, invoiceId) => [invoiceKeys.detail(invoiceId)],
    errorTitle: "Error al consultar estado SAT",
    onSuccess: (data) => {
      const status = data?.cancellation_status;
      if (status === "accepted") notifySuccess("Cancelación aceptada por el SAT");
      else if (status === "rejected")
        notifyWarning({ title: "Cancelación rechazada", description: "El receptor no aceptó la cancelación." });
      else if (status === "expired") notifyWarning("Cancelación expirada");
      else notifyInfo(satStatusLabel(status));
    },
  });
}

// M25: refresh de cancelación para NOTAS DE CRÉDITO (credit_notes).
// Misma edge function; invalida las listas de invoices porque las NCs se
// muestran en el detalle de la factura.
export function useRefreshCreditNoteCancellationStatus() {
  return useEntityMutation({
    mutationFn: async (creditNoteId: string) => {
      return await invokeEdgeFunction<{ cancellation_status: string }>(
        "refresh-cancellation-status",
        { body: { credit_note_id: creditNoteId } },
      );
    },
    invalidateKeys: [invoiceKeys.all],
    errorTitle: "Error al consultar estado SAT",
    onSuccess: (data) => {
      const status = data?.cancellation_status;
      if (status === "accepted") notifySuccess("Cancelación de NC aceptada por el SAT");
      else if (status === "rejected")
        notifyWarning({ title: "Cancelación rechazada", description: "El receptor no aceptó la cancelación." });
      else if (status === "expired") notifyWarning("Cancelación expirada");
      else notifyInfo(satStatusLabel(status));
    },
  });
}

// FIX R4-04: refresh de cancelación para REPs (complementos de pago).
// La edge function refresh-cancellation-status ya acepta `payment_id` (N-27),
// pero ningún hook lo invocaba: un REP con rep_cancellation_status='pending'
// quedaba atorado sin vía de resolución desde la app. Invalida las keys de
// pagos para refrescar el historial.
export function useRefreshRepCancellationStatus() {
  return useEntityMutation({
    mutationFn: async (paymentId: string) => {
      return await invokeEdgeFunction<{ cancellation_status: string }>(
        "refresh-cancellation-status",
        { body: { payment_id: paymentId } },
      );
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "Error al consultar estado SAT",
    onSuccess: (data) => {
      const status = data?.cancellation_status;
      if (status === "accepted") notifySuccess("Cancelación de REP aceptada por el SAT");
      else if (status === "rejected")
        notifyWarning({ title: "Cancelación rechazada", description: "El receptor no aceptó la cancelación." });
      else if (status === "expired") notifyWarning("Cancelación expirada");
      else notifyInfo(satStatusLabel(status));
    },
  });
}

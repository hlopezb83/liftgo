import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

import { invoiceKeys } from "../../../lib/queryKeys";
interface GenerateRecurringResponse {
  invoicesCreated?: number;
}

/**
 * Disparador del Edge Function `generate-recurring-invoices`.
 * Genera borradores de facturas para reservas con `recurring_billing` habilitado.
 */
export function useGenerateRecurringInvoices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<GenerateRecurringResponse> => {
      return await invokeEdgeFunction<GenerateRecurringResponse>(
        "generate-recurring-invoices",
      );
    },
    onSuccess: (data) => {
      const count = data?.invoicesCreated ?? 0;
      notifySuccess(count > 0 ? `${count} factura(s) generada(s)` : "Sin facturas pendientes", {
        description:
          count > 0
            ? "Se crearon borradores de facturas recurrentes."
            : "No hay reservas con facturación recurrente pendiente.",
      });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err: unknown) => {
      notifyError({ error: err, title: "Error al generar facturas", description: err instanceof Error ? err.message : "Intenta de nuevo.", });
    },
  });
}

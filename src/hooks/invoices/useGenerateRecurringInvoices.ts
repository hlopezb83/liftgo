import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      const { data, error } = await supabase.functions.invoke("generate-recurring-invoices");
      if (error) throw error;
      return data as GenerateRecurringResponse;
    },
    onSuccess: (data) => {
      const count = data?.invoicesCreated ?? 0;
      toast.success(count > 0 ? `${count} factura(s) generada(s)` : "Sin facturas pendientes", {
        description:
          count > 0
            ? "Se crearon borradores de facturas recurrentes."
            : "No hay reservas con facturación recurrente pendiente.",
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err: unknown) => {
      toast.error("Error al generar facturas", {
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    },
  });
}

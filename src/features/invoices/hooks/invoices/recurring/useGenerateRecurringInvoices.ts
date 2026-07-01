import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

import { invoiceKeys } from "../../../lib/queryKeys";

export interface GenerateRecurringResponse {
  invoicesCreated?: number;
  bookingsBilled?: number;
  created?: Array<{
    bookingIds: string[];
    invoiceId: string;
    invoiceNumber: string | null;
  }>;
  failed?: Array<{ bookingIds: string[]; error: string }>;
}

/**
 * Ejecuta la generación real de facturas recurrentes.
 * Si se pasan `bookingIds`, genera SOLO esas; si no, todas las elegibles.
 */
export function useGenerateRecurringInvoices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      bookingIds?: string[],
    ): Promise<GenerateRecurringResponse> => {
      return await invokeEdgeFunction<GenerateRecurringResponse>(
        "generate-recurring-invoices",
        { body: { preview: false, bookingIds } },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err: unknown) => {
      notifyError({
        error: err,
        title: "Error al generar facturas",
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    },
  });
}

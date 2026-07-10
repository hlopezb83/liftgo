import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

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
  return useEntityMutation({
    mutationFn: async (
      bookingIds?: string[],
    ): Promise<GenerateRecurringResponse> => {
      return await invokeEdgeFunction<GenerateRecurringResponse>(
        "generate-recurring-invoices",
        { body: { preview: false, bookingIds } },
      );
    },
    invalidateKeys: [invoiceKeys.all],
    errorTitle: "Error al generar facturas",
  });
}

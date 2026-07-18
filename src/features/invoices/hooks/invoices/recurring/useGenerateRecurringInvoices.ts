import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyWarning } from "@/lib/ui/appFeedback";
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
      const result = await invokeEdgeFunction<GenerateRecurringResponse>(
        "generate-recurring-invoices",
        { body: { preview: false, bookingIds } },
      );
      // BL-008: exponer el detalle de `failed[]` (200 con failures parciales).
      // El toast de error del hook solo se dispara en throw; para éxitos
      // parciales usamos un warning explícito con causa y conteo.
      const failed = result?.failed ?? [];
      if (failed.length > 0) {
        const firstReason = failed[0]?.error?.slice(0, 140) ?? "sin detalle";
        notifyWarning({
          title: `${failed.length} reserva(s) no se facturaron`,
          description: firstReason,
        });
      }
      return result;
    },
    invalidateKeys: [invoiceKeys.all],
    errorTitle: "Error al generar facturas",
  });
}

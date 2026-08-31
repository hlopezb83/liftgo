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
  /** R6-F5: periodos NO facturados porque la tarifa pudo cambiar. */
  skippedStaleRate?: Array<{
    bookingIds: string[];
    periodStart: string;
    periodEnd: string;
  }>;
}

export interface GenerateRecurringArgs {
  bookingIds?: string[];
  /** R6-F5: confirmación explícita para facturar periodos con tarifa dudosa. */
  allowStaleRate?: boolean;
}

/**
 * Ejecuta la generación real de facturas recurrentes.
 * Si se pasan `bookingIds`, genera SOLO esas; si no, todas las elegibles.
 */
export function useGenerateRecurringInvoices() {
  return useEntityMutation({
    mutationFn: async (
      args?: GenerateRecurringArgs,
    ): Promise<GenerateRecurringResponse> => {
      const result = await invokeEdgeFunction<GenerateRecurringResponse>(
        "generate-recurring-invoices",
        {
          body: {
            preview: false,
            bookingIds: args?.bookingIds,
            allowStaleRate: args?.allowStaleRate === true,
          },
        },
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
      // R6-F5: fail-closed — avisar los periodos que el edge no facturó por
      // tarifa potencialmente desactualizada.
      const skipped = result?.skippedStaleRate ?? [];
      if (skipped.length > 0) {
        notifyWarning({
          title: `${skipped.length} periodo(s) no facturados por cambio de tarifa`,
          description:
            "La reserva se actualizó después del periodo. Revisa la tarifa y confirma para facturarlos.",
        });
      }
      return result;
    },
    invalidateKeys: [invoiceKeys.all],
    errorTitle: "Error al generar facturas",
  });
}

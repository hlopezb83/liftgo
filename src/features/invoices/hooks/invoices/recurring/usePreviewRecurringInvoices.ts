import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

export type PreviewReason =
  | "already_invoiced"
  | "no_customer"
  | "no_monthly_rate"
  | "period_in_future"
  | "period_too_old";

export interface RecurringPreviewLine {
  bookingId: string;
  bookingCode: string | null;
  customerId: string | null;
  customerName: string | null;
  forkliftName: string | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  monthlyRate: number;
  eligible: boolean;
  reason?: PreviewReason;
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
}

export interface RecurringPreviewResponse {
  period: string | null;
  lines: RecurringPreviewLine[];
}

/**
 * Dry-run del Edge Function: calcula qué facturas recurrentes se generarían,
 * sin escribir nada. Devuelve elegibles y no-elegibles (con motivo).
 */
export function usePreviewRecurringInvoices() {
  return useEntityMutation<void, RecurringPreviewResponse>({
    mutationFn: async (): Promise<RecurringPreviewResponse> => {
      const res = await invokeEdgeFunction<RecurringPreviewResponse>(
        "generate-recurring-invoices",
        { body: { preview: true } },
      );
      return {
        period: res.period ?? null,
        lines: Array.isArray(res.lines) ? res.lines : [],
      };
    },
    errorTitle: "Error al calcular vista previa",
  });
}

import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

export type PreviewReason =
  | "already_invoiced"
  | "no_customer"
  | "no_monthly_rate"
  | "period_in_future"
  | "booking_ended";

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
  // BL-12: monto real a facturar (prorrateado en el primer ciclo si aplica).
  billedAmount: number;
  // M-13: tasa de IVA del cliente (0–100, porcentaje) devuelta por el edge
  // (customer.tax_rate; frontera 8%, exento 0%). null/undefined ⇒ DEFAULT_VAT_RATE.
  taxRate?: number | null;
  isProrated: boolean;
  proratedDays?: number;
  eligible: boolean;
  /**
   * R6-F5: la reserva se actualizó DESPUÉS del fin de este periodo, por lo que
   * la tarifa pudo cambiar. El edge NO factura estos periodos salvo
   * confirmación explícita del operador (`allowStaleRate`).
   */
  rateWarning?: boolean;
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

import { useRef, useState } from "react";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

type PreviewReason =
  | "period_overlap_review"
  | "legacy_period_review"
  | "already_invoiced"
  | "no_customer"
  | "no_monthly_rate"
  | "period_in_future"
  | "booking_ended"
  | "no_exchange_rate"
  | "quote_charge_review"
  | "quote_discount_review"
  | "quote_source_missing";

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
  /** Divisa original de la reserva; el servidor no mezcla importes entre divisas. */
  currency?: string;
  // BL-12: monto real a facturar (prorrateado en el primer ciclo si aplica).
  billedAmount: number;
  // M-13: tasa de IVA del cliente (0–100, porcentaje) devuelta por el edge
  // (customer.tax_rate; frontera 8%, exento 0%). null/undefined ⇒ DEFAULT_VAT_RATE.
  taxRate?: number | null;
  isProrated: boolean;
  isFuture?: boolean;
  previewFingerprint?: string;
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
  quoteId?: string;
}

export interface RecurringPreviewScope {
  includeFuturePeriods: boolean;
  futureThroughMonth?: string;
}

export interface RecurringPreviewResponse {
  /** Client-side request scope. Never inferred from a previous response. */
  scope?: RecurringPreviewScope;
  period: string | null;
  lines: RecurringPreviewLine[];
  truncated?: boolean;
  pending_count?: number;
}

/**
 * Dry-run del Edge Function: calcula qué facturas recurrentes se generarían,
 * sin escribir nada. Devuelve elegibles y no-elegibles (con motivo).
 */
export function usePreviewRecurringInvoices() {
  const requestId = useRef(0);
  const [state, setState] = useState<{
    data?: RecurringPreviewResponse; isPending: boolean; isError: boolean;
  }>({ isPending: false, isError: false });
  const mutation = useEntityMutation<RecurringPreviewScope, RecurringPreviewResponse>({
    mutationFn: async (scope): Promise<RecurringPreviewResponse> => {
      const res = await invokeEdgeFunction<RecurringPreviewResponse>(
        "generate-recurring-invoices",
        { body: { preview: true, ...scope } },
      );
      return {
        scope,
        period: res.period ?? null,
        lines: Array.isArray(res.lines) ? res.lines : [],
        truncated: res.truncated === true,
        pending_count: Number(res.pending_count ?? 0),
      };
    },
    errorTitle: "Error al calcular vista previa",
  });
  // Preview is read-only. Allow a newer horizon while a request is pending,
  // but never publish a late result (including one from a closed session).
  const mutate = (scope: RecurringPreviewScope = { includeFuturePeriods: false }) => {
    const id = ++requestId.current;
    const requestedScope = { ...scope, futureThroughMonth: scope.includeFuturePeriods ? scope.futureThroughMonth : undefined };
    setState({ isPending: true, isError: false });
    void mutation.mutateAsync(requestedScope).then(
      (data) => { if (id === requestId.current) setState({ data, isPending: false, isError: false }); },
      () => { if (id === requestId.current) setState({ isPending: false, isError: true }); },
    );
  };
  return { ...state, mutate };
}

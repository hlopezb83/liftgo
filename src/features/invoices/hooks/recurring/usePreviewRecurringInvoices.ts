import { useCallback, useEffect, useRef, useState } from "react";
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
  const active = useRef<{ scope: RecurringPreviewScope; controller: AbortController } | null>(null);
  const [state, setState] = useState<{
    data?: RecurringPreviewResponse; isPending: boolean; isError: boolean;
  }>({ isPending: false, isError: false });
  const cancelActive = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
  }, []);
  useEffect(() => cancelActive, [cancelActive]);

  const mutation = useEntityMutation<{ scope: RecurringPreviewScope; signal: AbortSignal }, RecurringPreviewResponse>({
    mutationFn: async ({ scope, signal }): Promise<RecurringPreviewResponse> => {
      const res = await invokeEdgeFunction<RecurringPreviewResponse>(
        "generate-recurring-invoices",
        { body: { preview: true, ...scope }, signal },
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
    onError: (_error, { signal }) => signal.aborted,
  });
  // Preview is read-only. Allow a newer horizon while a request is pending,
  // but never publish a late result (including one from a closed session).
  const mutate = (scope: RecurringPreviewScope = { includeFuturePeriods: false }) => {
    const requestedScope = { ...scope, futureThroughMonth: scope.includeFuturePeriods ? scope.futureThroughMonth : undefined };
    const previous = active.current?.scope;
    if (previous?.includeFuturePeriods === requestedScope.includeFuturePeriods &&
      previous.futureThroughMonth === requestedScope.futureThroughMonth) return;
    cancelActive();
    const request = { scope: requestedScope, controller: new AbortController() };
    active.current = request;
    setState({ isPending: true, isError: false });
    const settle = (next: typeof state) => {
      if (active.current !== request) return;
      active.current = null;
      setState(next);
    };
    void mutation.mutateAsync({ scope: requestedScope, signal: request.controller.signal }).then(
      (data) => settle({ data, isPending: false, isError: false }),
      () => settle({ isPending: false, isError: true }),
    );
  };
  const cancel = useCallback(() => {
    cancelActive();
    setState({ isPending: false, isError: false });
  }, [cancelActive]);
  return { ...state, mutate, cancel };
}

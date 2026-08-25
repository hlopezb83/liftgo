import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";
import type { DrilldownInvoice } from "../lib/drilldown";

export interface RevenueMonthRow {
  monthKey: string;
  invoiced: number;
  paid: number;
  invoiceCount: number;
  /**
   * H-2: facturas en divisa sin `tipo_cambio` capturado. No se convierten a
   * MXN (antes se sumaban 1:1) y por eso quedan fuera de `invoiced`.
   */
  fxMissingCount: number;
}

/**
 * FIX-FE-01: Ingresos por mes calculados en el servidor vía RPC
 * `report_revenue_by_month` (mismo patrón que useProfitByModelReport).
 * Reemplaza `useInvoices()` (capado a 501 filas) que subestimaba el reporte.
 * Postgres devuelve `numeric` como string; el mapping normaliza a `number`.
 *
 * H-1: `paid` viene de los pagos reales y `invoiced` ya deduce las notas de
 * crédito timbradas.
 */
export function useRevenueByMonthReport(startDate: Date, endDate: Date) {
  const start = toYMD(startDate);
  const end = toYMD(endDate);
  return useQuery({
    queryKey: ["report", "revenue-by-month", start, end],
    queryFn: async (): Promise<RevenueMonthRow[]> => {
      const { data, error } = await supabase.rpc("report_revenue_by_month", {
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        monthKey: r.month_key,
        invoiced: Number(r.invoiced),
        paid: Number(r.paid),
        invoiceCount: Number(r.invoice_count),
        fxMissingCount: Number(r.fx_missing_count ?? 0),
      }));
    },
  });
}


/**
 * Facturas que componen un mes (drilldown). Solo se ejecuta al abrir el sheet
 * (`enabled`), así el reporte ya no carga la lista completa de facturas.
 */
export function useRevenueMonthInvoices(monthKey: string | null) {
  return useQuery({
    queryKey: ["report", "revenue-month-invoices", monthKey],
    enabled: monthKey !== null,
    queryFn: async (): Promise<DrilldownInvoice[]> => {
      const { data, error } = await supabase.rpc("report_revenue_month_invoices", {
        _month_key: monthKey ?? "",
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

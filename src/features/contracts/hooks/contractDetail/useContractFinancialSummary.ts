import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "@/features/invoices";
import { supabase } from "@/integrations/supabase/client";

type InvoiceSummaryRow = { id: string; subtotal: number; status: string };
type PivotRow = { invoice_id: string; invoices: InvoiceSummaryRow | null };

/**
 * F3 (Sprint M3): combina la ruta directa (invoices.booking_id) con las
 * facturas ligadas vía la pivote `invoice_bookings`, deduplicando por
 * `invoice.id` (una factura ligada por ambas rutas cuenta una sola vez) y
 * descartando `status === 'cancelled'` en ambas fuentes.
 */
export function combineInvoiceSummaries(
  direct: InvoiceSummaryRow[] | null,
  pivot: PivotRow[] | null,
): InvoiceSummaryRow[] {
  const byId = new Map<string, InvoiceSummaryRow>();
  for (const row of direct ?? []) {
    byId.set(row.id, row);
  }
  for (const row of pivot ?? []) {
    const invoice = row.invoices;
    if (!invoice || invoice.status === "cancelled") continue;
    byId.set(invoice.id, invoice);
  }
  return Array.from(byId.values());
}

export function useContractFinancialSummary(bookingId: string) {
  return useQuery({
    queryKey: invoiceKeys.list({ booking_id: bookingId }),
    enabled: !!bookingId,
    queryFn: async () => {
      // Ruta directa: facturas simples con booking_id propio.
      const { data: direct, error: directErr } = await supabase
        .from("invoices")
        // M-14: se selecciona `subtotal` (sin IVA) porque el consumidor lo
        // compara contra el revenue esperado del contrato, que es sin IVA.
        // Comparar contra `total` (con IVA) inflaba lo facturado.
        .select("id, subtotal, status")
        .eq("booking_id", bookingId)
        .neq("status", "cancelled");
      if (directErr) throw directErr;

      // F3: facturas multi-reserva solo ligadas vía la tabla pivote
      // `invoice_bookings` (reservas 2..n de una factura combinada).
      const { data: pivot, error: pivotErr } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, invoices(id, subtotal, status)")
        .eq("booking_id", bookingId);
      if (pivotErr) throw pivotErr;

      return combineInvoiceSummaries(
        direct as InvoiceSummaryRow[] | null,
        pivot as unknown as PivotRow[] | null,
      );
    },
  });
}

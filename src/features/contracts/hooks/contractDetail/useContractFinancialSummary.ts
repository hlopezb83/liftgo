import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "@/features/invoices";
import { supabase } from "@/integrations/supabase/client";

type InvoiceSummaryRow = { id: string; subtotal: number; status: string };
type InvoiceLine = { total?: number | null; unit_price?: number | null; quantity?: number | null };
type PivotInvoice = InvoiceSummaryRow & { line_items?: unknown };
export type PivotRow = {
  invoice_id: string;
  line_index?: number | null;
  invoices: PivotInvoice | null;
};

function lineSubtotal(lineItems: unknown, lineIndex: number | null | undefined): number | null {
  if (lineIndex == null || !Array.isArray(lineItems)) return null;
  const line = lineItems[lineIndex] as InvoiceLine | undefined;
  if (!line) return null;
  if (typeof line.total === "number" && Number.isFinite(line.total)) return line.total;
  if (typeof line.unit_price === "number" && typeof line.quantity === "number") {
    return line.unit_price * line.quantity;
  }
  return null;
}

/**
 * N-MEDIO (auditoría v2 §3.2): una factura multi-reserva se sumaba COMPLETA en
 * el resumen de cada contrato ligado, inflando lo "Facturado". Ahora se
 * atribuye solo la parte que corresponde a esta reserva:
 *  1) la partida indicada por `line_index` de la pivote, si existe; o
 *  2) prorrateo entre las reservas ligadas a esa factura (`bookingsPerInvoice`).
 */
export function attributedSubtotal(
  invoice: PivotInvoice,
  lineIndex: number | null | undefined,
  bookingsInInvoice: number,
): number {
  const fromLine = lineSubtotal(invoice.line_items, lineIndex);
  if (fromLine != null) return fromLine;
  const divisor = bookingsInInvoice > 0 ? bookingsInInvoice : 1;
  return (invoice.subtotal ?? 0) / divisor;
}

/**
 * F3 (Sprint M3): combina la ruta directa (invoices.booking_id) con las
 * facturas ligadas vía la pivote `invoice_bookings`, deduplicando por
 * `invoice.id` (una factura ligada por ambas rutas cuenta una sola vez) y
 * descartando `status === 'cancelled'` en ambas fuentes.
 *
 * `bookingsPerInvoice` permite prorratear facturas multi-reserva.
 */
export function combineInvoiceSummaries(
  direct: InvoiceSummaryRow[] | null,
  pivot: PivotRow[] | null,
  bookingsPerInvoice?: Record<string, number>,
): InvoiceSummaryRow[] {
  const byId = new Map<string, InvoiceSummaryRow>();
  for (const row of direct ?? []) {
    byId.set(row.id, row);
  }
  for (const row of pivot ?? []) {
    const invoice = row.invoices;
    if (!invoice || invoice.status === "cancelled") continue;
    const count = bookingsPerInvoice?.[invoice.id] ?? 1;
    const subtotal =
      count > 1 ? attributedSubtotal(invoice, row.line_index, count) : invoice.subtotal;
    byId.set(invoice.id, { id: invoice.id, subtotal, status: invoice.status });
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
        .select("invoice_id, line_index, invoices(id, subtotal, status, line_items)")
        .eq("booking_id", bookingId);
      if (pivotErr) throw pivotErr;

      // Cuántas reservas cubre cada factura → base del prorrateo.
      const invoiceIds = (pivot ?? []).map((r) => r.invoice_id);
      const bookingsPerInvoice: Record<string, number> = {};
      if (invoiceIds.length > 0) {
        const { data: siblings, error: sibErr } = await supabase
          .from("invoice_bookings")
          .select("invoice_id")
          .in("invoice_id", invoiceIds);
        if (sibErr) throw sibErr;
        for (const row of siblings ?? []) {
          bookingsPerInvoice[row.invoice_id] = (bookingsPerInvoice[row.invoice_id] ?? 0) + 1;
        }
      }

      return combineInvoiceSummaries(
        direct as InvoiceSummaryRow[] | null,
        pivot as unknown as PivotRow[] | null,
        bookingsPerInvoice,
      );
    },
  });
}

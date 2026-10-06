import { useQuery } from "@tanstack/react-query";
import { invoiceKeys } from "@/features/invoices";
import { supabase } from "@/integrations/supabase/client";
import { ISSUED_INVOICE_STATUSES, isIssuedInvoiceStatus } from "@/lib/domain/invoiceStatus";
import { toMxn } from "@/lib/money";
import { attributedRentalSubtotal, type InvoiceBookingLink } from "../../lib/invoiceRentalAttribution";

type InvoiceSummaryRow = { id: string; subtotal: number | null; status: string };
type InvoiceCurrencyRow = InvoiceSummaryRow & {
  moneda?: string | null;
  tipo_cambio?: number | string | null;
};

/**
 * FIX B2: el resumen sumaba `subtotal` en crudo. Una factura en USD se
 * contaba 1:1 contra un revenue esperado en pesos (como pagar una cuenta en
 * pesos con billetes de dólar del mismo número). Normalizamos a MXN.
 */
function subtotalMxn(row: InvoiceCurrencyRow): number | null {
  if (row.subtotal === null || !Number.isFinite(row.subtotal)) return null;
  if ((row.moneda ?? "MXN").toUpperCase() !== "MXN" && (!Number.isFinite(Number(row.tipo_cambio)) || Number(row.tipo_cambio) <= 0)) return null;
  return toMxn(row.subtotal, row.moneda ?? null, row.tipo_cambio ?? null);
}
type PivotInvoice = InvoiceSummaryRow & { line_items?: unknown };
export type PivotRow = {
  invoice_id: string;
  line_index?: number | null;
  invoices: PivotInvoice | null;
};

/**
 * N-MEDIO (auditoría v2 §3.2): una factura multi-reserva se sumaba COMPLETA en
 * el resumen de cada contrato ligado, inflando lo "Facturado". Ahora se
 * atribuye solo la parte que corresponde a esta reserva:
 *  El índice ordinal de la pivote no identifica una partida. Sin una
 *  atribución comprobable se devuelve null para pedir revisión.
 */
function attributedSubtotal(
  invoice: PivotInvoice,
  lineIndex: number | null | undefined,
  bookingsInInvoice: number,
): number | null {
  // The database stores booking selection order in line_index. It does not
  // establish that this line (or all its amounts) belongs to this booking.
  return bookingsInInvoice <= 1 ? invoice.subtotal : null;
}

interface InvoiceAttributionContext { bookingId: string; links: InvoiceBookingLink[] }

function verifiedSubtotal(invoice: PivotInvoice, count: number, attribution?: InvoiceAttributionContext): number | null {
  const links = attribution?.links.filter((link) => link.invoice_id === invoice.id) ?? [];
  const subtotal = attribution ? attributedRentalSubtotal(invoice.line_items, Number(invoice.subtotal), attribution.bookingId, links)
    : attributedSubtotal(invoice, null, count);
  return subtotalMxn({ ...invoice, subtotal } as InvoiceCurrencyRow);
}

function requireComplete(count: number | null, rows: unknown[] | null, message: string): void {
  if (count !== (rows ?? []).length) throw new Error(message);
}

/**
 * F3 (Sprint M3): combina la ruta directa (invoices.booking_id) con las
 * facturas ligadas vía la pivote `invoice_bookings`, deduplicando por
 * `invoice.id` (una factura ligada por ambas rutas cuenta una sola vez) y
 * descartando `status === 'cancelled'` en ambas fuentes.
 *
 * Los vínculos completos identifican la renta atribuible a cada reserva.
 * Un reparto ambiguo queda como null para que la UI solicite revisión.
 */
export function combineInvoiceSummaries(
  direct: InvoiceSummaryRow[] | null,
  pivot: PivotRow[] | null,
  bookingsPerInvoice?: Record<string, number>,
  attribution?: InvoiceAttributionContext,
): InvoiceSummaryRow[] {
  const byId = new Map<string, InvoiceSummaryRow>();
  const sources = [...(direct ?? []), ...(pivot ?? []).flatMap((row) => row.invoices ?? [])];
  for (const row of sources) {
    // Bloque 3C: solo estados emitidos válidos (draft/void/cancelled no cuentan).
    if (!isIssuedInvoiceStatus(row.status)) continue;
    const subtotal = verifiedSubtotal(row, bookingsPerInvoice?.[row.id] ?? 1, attribution);
    byId.set(row.id, { id: row.id, subtotal, status: row.status });
  }
  return Array.from(byId.values());
}

export function useContractFinancialSummary(bookingId: string) {
  return useQuery({
    queryKey: invoiceKeys.list({ booking_id: bookingId }),
    enabled: !!bookingId,
    queryFn: async () => {
      // Ruta directa: facturas simples con booking_id propio.
      const { data: direct, error: directErr, count: directCount } = await supabase
        .from("invoices")
        // M-14: se selecciona `subtotal` (sin IVA) porque el consumidor lo
        // compara contra el revenue esperado del contrato, que es sin IVA.
        // Comparar contra `total` (con IVA) inflaba lo facturado.
        .select("id, subtotal, status, line_items, moneda, tipo_cambio", { count: "exact" })
        .eq("booking_id", bookingId)
        .in("status", [...ISSUED_INVOICE_STATUSES])
        .limit(1001);
      if (directErr) throw directErr;
      requireComplete(directCount, direct, "No se pudieron verificar todas las facturas de la reserva.");

      // F3: facturas multi-reserva solo ligadas vía la tabla pivote
      // `invoice_bookings` (reservas 2..n de una factura combinada).
      const { data: pivot, error: pivotErr, count: pivotCount } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, line_index, invoices(id, subtotal, status, line_items, moneda, tipo_cambio)", { count: "exact" })
        .eq("booking_id", bookingId)
        .limit(1001);
      if (pivotErr) throw pivotErr;
      requireComplete(pivotCount, pivot, "No se pudieron verificar los vínculos de todas las facturas.");

      // Todos los vínculos, también para la reserva primaria de la factura.
      const invoiceIds = [...new Set([...(direct ?? []).map((r) => r.id), ...(pivot ?? []).map((r) => r.invoice_id)])];
      const bookingsPerInvoice: Record<string, number> = {};
      let attributionLinks: InvoiceBookingLink[] = [];
      if (invoiceIds.length > 0) {
        const { data: siblings, error: sibErr, count } = await supabase
          .from("invoice_bookings")
          .select("invoice_id, booking_id, bookings(forklifts(name, serial_number))", { count: "exact" })
          .in("invoice_id", invoiceIds)
          .limit(1001)
          .returns<InvoiceBookingLink[]>();
        if (sibErr) throw sibErr;
        requireComplete(count, siblings, "No se pudieron verificar todas las reservas de las facturas.");
        attributionLinks = siblings ?? [];
        for (const row of siblings ?? []) {
          bookingsPerInvoice[row.invoice_id] = (bookingsPerInvoice[row.invoice_id] ?? 0) + 1;
        }
      }

      return combineInvoiceSummaries(
        direct as InvoiceSummaryRow[] | null,
        pivot as unknown as PivotRow[] | null,
        bookingsPerInvoice,
        { bookingId, links: attributionLinks },
      );
    },
  });
}

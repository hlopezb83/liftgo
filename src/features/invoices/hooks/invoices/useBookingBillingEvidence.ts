import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";
import type { ReturnBillingEvidence } from "../../lib/completedRecurringBooking";
import type { BillingExtension, BookingInvoiceClaim } from "../../lib/originalBookingPeriod";

const PAGE_SIZE = 1000;

/** A partial read must never reopen an already billed period. */
export async function readAllBillingPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 100; page++) {
    signal?.throwIfAborted();
    const { data, error } = await read(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    // Also reject when a transport resolves after cancellation. Never expose a
    // partial history or start another page after the form's query is abandoned.
    signal?.throwIfAborted();
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("No se pudo verificar el historial completo de facturación. Recarga y reintenta.");
}

interface InvoiceEvidence {
  id: string; booking_id: string | null; status: string; line_items: unknown; moneda: string | null;
  billing_period_start: string | null; billing_period_end: string | null;
}
interface PivotEvidence {
  invoice_id: string; booking_id: string;
  invoices: Omit<InvoiceEvidence, "id" | "booking_id">;
}

export async function fetchBookingInvoiceClaims(signal?: AbortSignal): Promise<BookingInvoiceClaim[]> {
  const [direct, pivot] = await Promise.all([
    readAllBillingPages<InvoiceEvidence>((from, to) => {
      const query = supabase.from("invoices")
        .select("id, booking_id, status, line_items, moneda, billing_period_start, billing_period_end")
        .not("booking_id", "is", null).neq("status", "cancelled")
        .order("id").range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, signal),
    readAllBillingPages<PivotEvidence>((from, to) => {
      const query = supabase.from("invoice_bookings")
        .select("invoice_id, booking_id, invoices!inner(status, line_items, moneda, billing_period_start, billing_period_end)")
        .neq("invoices.status", "cancelled").order("invoice_id").order("booking_id").range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, signal),
  ]);
  return [
    ...direct.flatMap((row) => row.booking_id ? [{ ...row, booking_id: row.booking_id, invoice_id: row.id }] : []),
    ...pivot.map((row) => ({ ...row.invoices, invoice_id: row.invoice_id, booking_id: row.booking_id })),
  ];
}

export function useBookingBillingEvidence() {
  const claims = useQuery({ queryKey: [...invoiceKeys.lists(), "booking-period-claims"], queryFn: ({ signal }) => fetchBookingInvoiceClaims(signal) });
  const extensions = useQuery({
    queryKey: ["bookings", "billing-extension-history"],
    queryFn: ({ signal }) => readAllBillingPages<BillingExtension>((from, to) => supabase.from("booking_extensions")
      .select("booking_id, original_end_date, new_end_date, invoice_id, pending_invoice_id")
      .order("id").range(from, to).abortSignal(signal), signal),
  });
  const returns = useQuery({
    queryKey: ["bookings", "billing-return-history"],
    queryFn: ({ signal }) => readAllBillingPages<ReturnBillingEvidence>((from, to) => supabase.from("return_inspections")
      .select("booking_id, forklift_id, inspected_at").order("id").range(from, to).abortSignal(signal), signal),
  });
  return { claims, extensions, returns };
}

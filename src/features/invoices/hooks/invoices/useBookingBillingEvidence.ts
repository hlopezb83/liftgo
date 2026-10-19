import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";
import type { BillingExtension, BookingInvoiceClaim } from "../../lib/originalBookingPeriod";

const PAGE_SIZE = 1000;

/** A partial read must never reopen an already billed period. */
export async function readAllBillingPages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await read(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("No se pudo verificar el historial completo de facturación. Recarga y reintenta.");
}

interface InvoiceEvidence {
  id: string; booking_id: string | null; status: string;
  billing_period_start: string | null; billing_period_end: string | null;
}
interface PivotEvidence {
  invoice_id: string; booking_id: string;
  invoices: Omit<InvoiceEvidence, "id" | "booking_id">;
}

export async function fetchBookingInvoiceClaims(): Promise<BookingInvoiceClaim[]> {
  const [direct, pivot] = await Promise.all([
    readAllBillingPages<InvoiceEvidence>((from, to) => supabase.from("invoices")
      .select("id, booking_id, status, billing_period_start, billing_period_end")
      .not("booking_id", "is", null).neq("status", "cancelled")
      .order("id").range(from, to)),
    readAllBillingPages<PivotEvidence>((from, to) => supabase.from("invoice_bookings")
      .select("invoice_id, booking_id, invoices!inner(status, billing_period_start, billing_period_end)")
      .neq("invoices.status", "cancelled").order("invoice_id").order("booking_id").range(from, to)),
  ]);
  return [
    ...direct.flatMap((row) => row.booking_id ? [{ ...row, booking_id: row.booking_id, invoice_id: row.id }] : []),
    ...pivot.map((row) => ({ ...row.invoices, invoice_id: row.invoice_id, booking_id: row.booking_id })),
  ];
}

export function useBookingBillingEvidence() {
  const claims = useQuery({ queryKey: [...invoiceKeys.lists(), "booking-period-claims"], queryFn: fetchBookingInvoiceClaims });
  const extensions = useQuery({
    queryKey: ["bookings", "billing-extension-history"],
    queryFn: () => readAllBillingPages<BillingExtension>((from, to) => supabase.from("booking_extensions")
      .select("booking_id, original_end_date, new_end_date, invoice_id, pending_invoice_id")
      .order("id").range(from, to)),
  });
  return { claims, extensions };
}

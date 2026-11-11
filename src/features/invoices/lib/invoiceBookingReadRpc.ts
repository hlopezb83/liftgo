import { z } from "zod";
import type { BookingWithForklift } from "@/features/bookings";
import { supabase } from "@/integrations/supabase/client";

type InvoiceBookingReads = {
  get_invoice_booking_candidate_page: {
    p_expected_organization_id: string;
    p_search: string;
    p_customer_id: string | null;
    p_page: number;
    p_page_size: number;
    p_linked_ids: string[];
    p_include_e2e: boolean;
  };
  get_invoice_booking_billing_evidence: {
    p_expected_organization_id: string;
    p_booking_ids: string[];
    p_include_e2e: boolean;
  };
};

type ReadResult = { data: unknown; error: { message: string; code?: string } | null };
type UntypedReadRpc = (fn: string, args: Record<string, unknown>) => {
  abortSignal: (signal: AbortSignal) => PromiseLike<ReadResult>;
};

async function readRpc<K extends keyof InvoiceBookingReads>(
  fn: K, args: InvoiceBookingReads[K], signal: AbortSignal,
) {
  signal.throwIfAborted();
  // These functions may reach the preview before the generated schema does.
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedReadRpc;
  const { data, error } = await rpc(fn, args).abortSignal(signal);
  signal.throwIfAborted();
  if (error) throw error;
  return data;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bookingRow = z.looseObject({
  id: z.string(), organization_id: z.string(), status: z.string(),
  start_date: date, end_date: date, forklift_id: z.string(),
  customer_id: z.string().nullable(), customer_name: z.string().nullable(),
  booking_number: z.string().nullable(), quote_id: z.string().nullable(),
  quote_rental_line_index: z.number().int().nullable(), recurring_billing: z.boolean().nullable(),
  daily_rate: z.number().nullable(), weekly_rate: z.number().nullable(), monthly_rate: z.number().nullable(),
  currency: z.string().nullable(), tipo_cambio: z.number().nullable(),
  forklifts: z.object({ name: z.string().nullable(), model: z.string().nullable() }).nullable(),
});
const candidatePage = z.object({
  rows: z.array(bookingRow), linked: z.array(bookingRow),
  hasMore: z.boolean(), pageIndex: z.number().int().nonnegative(),
});

export async function readInvoiceBookingCandidatePage(
  args: InvoiceBookingReads["get_invoice_booking_candidate_page"], signal: AbortSignal,
) {
  const page = candidatePage.parse(await readRpc("get_invoice_booking_candidate_page", args, signal));
  const linkedIds = new Set(page.linked.map((row) => row.id));
  if (page.pageIndex !== args.p_page || page.rows.length > args.p_page_size
    || page.rows.some((row) => row.status !== "confirmed" && row.status !== "completed")
    || [...page.rows, ...page.linked].some((row) => row.organization_id !== args.p_expected_organization_id)
    || linkedIds.size !== new Set(args.p_linked_ids).size || args.p_linked_ids.some((id) => !linkedIds.has(id))) {
    throw new Error("No se pudo verificar la página de reservas y sus vínculos.");
  }
  // The SQL projection includes the booking row plus the same equipment join
  // used by the previous PostgREST read. The validator checks consumed fields.
  const byId = new Map([...page.rows, ...page.linked].map((row) => [row.id, row as unknown as BookingWithForklift]));
  return { bookings: [...byId.values()], hasMore: page.hasMore, pageIndex: page.pageIndex };
}

const billingEvidence = z.object({
  bookingIds: z.array(z.string()),
  invoices: z.array(z.object({
    id: z.string(), status: z.string(), line_items: z.json(), moneda: z.string().nullable(),
    billing_period_start: date.nullable(), billing_period_end: date.nullable(),
  })),
  claims: z.array(z.object({ invoice_id: z.string(), booking_id: z.string() })),
  extensions: z.array(z.object({ booking_id: z.string(), original_end_date: date,
    new_end_date: date, invoice_id: z.string().nullable(), pending_invoice_id: z.string().nullable() })),
  returns: z.array(z.object({ booking_id: z.string(), forklift_id: z.string(), inspected_at: z.string() })),
});

export async function readInvoiceBookingBillingEvidence(
  args: InvoiceBookingReads["get_invoice_booking_billing_evidence"], signal: AbortSignal,
) {
  const value = billingEvidence.parse(await readRpc("get_invoice_booking_billing_evidence", args, signal));
  const requested = new Set(args.p_booking_ids);
  const covered = new Set(value.bookingIds);
  const invoices = new Map(value.invoices.map(({ id, ...fields }) => [id, fields]));
  const relevantInvoices = new Set(value.claims.filter((claim) => requested.has(claim.booking_id)).map((claim) => claim.invoice_id));
  const incomplete = "No se pudo verificar el historial completo de las reservas.";
  if (requested.size !== covered.size || [...requested].some((id) => !covered.has(id))
    || invoices.size !== value.invoices.length || invoices.size !== relevantInvoices.size
    || [...value.extensions, ...value.returns].some((row) => !requested.has(row.booking_id))) {
    throw new Error(incomplete);
  }
  const claims = value.claims.map((claim) => {
    const fields = invoices.get(claim.invoice_id);
    if (!fields || fields.status === "cancelled") throw new Error(incomplete);
    return { ...fields, ...claim };
  });
  return { claims, extensions: value.extensions, returns: value.returns };
}

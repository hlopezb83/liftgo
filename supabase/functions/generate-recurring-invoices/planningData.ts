import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import {
  type HistoricalInvoice,
  mergeLiveInvoiceHistory,
} from "./invoiceHistory.ts";
import { recurringQuoteIssue } from "./quoteDiscountGuard.ts";
import { recurringQuoteCharges } from "./quoteCharges.ts";
import type { BookingSource, PlanningContext } from "./planTypes.ts";
import type { RecurringPerformance } from "./performance.ts";

export const PLANNING_BATCH_SIZE = 100;
const PAGE_SIZE = 500;
// Bound read cardinality; variable payload sizes still affect memory and time.
export const MAX_PLANNING_ROWS = 50_000;
export const MAX_PLANNING_PAGES = 1_000;
type ReadBudget = { rows: number; pages: number };
type ReadPhase = "bookings" | "fiscal" | "history_linked" | "history_direct";
const BOOKING_FIELDS =
  "id, organization_id, booking_number, customer_id, customer_name, quote_id, start_date, end_date, last_billed_date, monthly_rate, currency, tipo_cambio, updated_at, forklifts(name, monthly_rate, serial_number), quotes(organization_id, line_items, rental_meta)";
// History only needs coverage/cancellation metadata. Keep quote line_items and
// charge-availability RPCs intact: their source quantities are fiscal evidence.
const INVOICE_FIELDS =
  "id, invoice_number, billing_period_start, billing_period_end, status, cfdi_status, cfdi_uuid, cancellation_status, occupies_booking_period:invoice_occupies_booking_period";
const FISCAL_FIELDS =
  "organization_id, customer_id, tax_rate, rfc, razon_social, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi";

type PageResult = { data: unknown; error: unknown; count?: number | null };
type PageQuery = {
  range: (from: number, to: number) => PromiseLike<PageResult>;
};

/** Keyset pages avoid offset skips; remaining counts detect cardinality drift. */
async function readAll<T>(
  query: (last?: T) => PageQuery,
  budget: ReadBudget,
  key: (row: T) => string[],
  phase: ReadPhase,
  metrics?: RecurringPerformance,
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | undefined;
  let last: T | undefined;
  do {
    if (++budget.pages > MAX_PLANNING_PAGES) {
      throw new Error(
        "La vista previa supera el límite de lectura seguro; reduce el alcance",
      );
    }
    metrics?.count("read_pages", 1);
    const read = () => query(last).range(0, PAGE_SIZE - 1);
    const { data, error, count } = metrics
      ? await metrics.measure(phase, read)
      : await read();
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count! < 0) {
      throw new Error(
        "No se pudo verificar la lectura completa de facturación",
      );
    }
    if (expected !== undefined && count !== expected - rows.length) {
      throw new Error(
        "El historial cambió durante la lectura; vuelve a calcular la vista previa",
      );
    }
    expected ??= count!;
    if (budget.rows + count! > MAX_PLANNING_ROWS) {
      throw new Error(
        "La vista previa supera el límite de lectura seguro; reduce el alcance",
      );
    }
    if (data.length > count! || (!data.length && count! > 0)) {
      throw new Error("La lectura de facturación está incompleta");
    }
    for (const row of data as T[]) {
      const current = key(row);
      const previous = last === undefined ? undefined : key(last);
      if (
        current.some((part) => typeof part !== "string" || !part) ||
        previous && current.every((part, index) => part === previous[index])
      ) {
        throw new Error(
          "Identidad repetida o inválida durante la lectura de facturación",
        );
      }
      if (previous) {
        const difference = current.findIndex((part, index) =>
          part !== previous[index]
        );
        if (current[difference] < previous[difference]) {
          throw new Error(
            "Orden inconsistente durante la lectura de facturación",
          );
        }
      }
      last = row;
    }
    rows.push(...data as T[]);
    budget.rows += data.length;
    metrics?.count(`${phase}_rows`, data.length);
    last = rows.at(-1);
  } while (rows.length < expected);
  return rows;
}

function batches<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += PLANNING_BATCH_SIZE) {
    result.push(items.slice(i, i + PLANNING_BATCH_SIZE));
  }
  return result;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

type PlanningReadScope = {
  org: string;
  group: BookingSource[];
  contexts: Map<string, PlanningContext>;
  budget: ReadBudget;
  metrics?: RecurringPerformance;
};

async function loadFiscalSnapshots(
  supabase: SupabaseClient,
  { org, group, contexts, budget, metrics }: PlanningReadScope,
): Promise<void> {
  const fiscal = new Map<string, Record<string, unknown>>();
  for (
    const ids of batches(unique(group.map((booking) => booking.customer_id)))
  ) {
    const requested = new Set(ids);
    const rows = await readAll<Record<string, unknown>>(
      (last) => {
        let query = supabase.from("organization_customers")
          .select(FISCAL_FIELDS, { count: "exact" }).eq(
            "organization_id",
            org,
          )
          .in("customer_id", ids).order("customer_id");
        if (last) query = query.gt("customer_id", last.customer_id);
        return query;
      },
      budget,
      (row) => [row.customer_id as string],
      "fiscal",
      metrics,
    );
    for (const row of rows) {
      const id = String(row.customer_id);
      if (
        row.organization_id !== org || !requested.has(id) || fiscal.has(id)
      ) throw new Error("Contexto fiscal de cliente inconsistente");
      fiscal.set(id, row);
    }
  }
  for (const booking of group) {
    contexts.get(booking.id)!.fiscal = fiscal.get(booking.customer_id ?? "") ??
      null;
  }
}

async function loadInvoiceHistory(
  supabase: SupabaseClient,
  { org, group, contexts, budget, metrics }: PlanningReadScope,
): Promise<void> {
  for (const ids of batches(group.map((booking) => booking.id))) {
    const requested = new Set(ids);
    type ScopedInvoice = HistoricalInvoice & {
      organization_id: string;
      booking_id: string;
    };
    type LinkedInvoice = {
      invoice_id: string;
      booking_id: string;
      invoices: ScopedInvoice | null;
    };
    const [linked, direct] = await Promise.all([
      readAll<LinkedInvoice>(
        (last) => {
          let query = supabase.from("invoice_bookings")
            .select(
              `booking_id, invoice_id, invoices!inner(${INVOICE_FIELDS}, organization_id)`,
              { count: "exact" },
            )
            .in("booking_id", ids).eq("invoices.organization_id", org)
            .order("booking_id").order("invoice_id");
          if (last) {
            // Quote server-owned IDs rather than interpolating raw PostgREST syntax.
            const booking = JSON.stringify(last.booking_id);
            const invoice = JSON.stringify(last.invoice_id);
            query = query.or(
              `booking_id.gt.${booking},and(booking_id.eq.${booking},invoice_id.gt.${invoice})`,
            );
          }
          return query;
        },
        budget,
        (row) => [row.booking_id, row.invoice_id],
        "history_linked",
        metrics,
      ),
      readAll<ScopedInvoice>(
        (last) => {
          let query = supabase.from("invoices")
            .select(`${INVOICE_FIELDS}, organization_id, booking_id`, {
              count: "exact",
            })
            .in("booking_id", ids).eq("organization_id", org).order("id");
          if (last) query = query.gt("id", last.id);
          return query;
        },
        budget,
        (row) => [row.id],
        "history_direct",
        metrics,
      ),
    ]);
    const linkedByBooking = new Map<string, LinkedInvoice[]>();
    const directByBooking = new Map<string, ScopedInvoice[]>();
    const linkedKeys = new Set<string>();
    const directKeys = new Set<string>();
    for (const row of linked) {
      const key = `${row.booking_id}|${row.invoices?.id}`;
      if (
        !requested.has(row.booking_id) || !row.invoices ||
        row.invoice_id !== row.invoices.id ||
        row.invoices.organization_id !== org || linkedKeys.has(key) ||
        typeof row.invoices.occupies_booking_period !== "boolean"
      ) throw new Error("Historial vinculado incompleto o inconsistente");
      linkedKeys.add(key);
      const bucket = linkedByBooking.get(row.booking_id) ?? [];
      bucket.push(row);
      linkedByBooking.set(row.booking_id, bucket);
    }
    for (const row of direct) {
      if (
        !requested.has(row.booking_id) || row.organization_id !== org ||
        directKeys.has(row.id) ||
        typeof row.occupies_booking_period !== "boolean"
      ) throw new Error("Historial directo incompleto o inconsistente");
      directKeys.add(row.id);
      const bucket = directByBooking.get(row.booking_id) ?? [];
      bucket.push(row);
      directByBooking.set(row.booking_id, bucket);
    }
    for (const id of ids) {
      contexts.get(id)!.invoices = mergeLiveInvoiceHistory(
        linkedByBooking.get(id) ?? [],
        directByBooking.get(id) ?? [],
      );
    }
  }
}

async function loadQuoteCharges(
  supabase: SupabaseClient,
  { group, contexts, metrics }: PlanningReadScope,
): Promise<void> {
  const quoteIds = unique(
    group.filter((booking) => !contexts.get(booking.id)!.quoteIssue).map((
      booking,
    ) => booking.quote_id),
  );
  const chargeByQuote = new Map<
    string,
    { snapshot: unknown; invalid: boolean }
  >();
  metrics?.count("quote_ids", quoteIds.length);
  for (const ids of batches(quoteIds)) {
    metrics?.count("charge_batches", 1);
    const readCharges = () =>
      supabase.rpc(
        "get_quote_charge_availability",
        { p_quote_ids: ids },
      );
    const { data, error } = metrics
      ? await metrics.measure("charges", readCharges)
      : await readCharges();
    if (error) throw error;
    const response = data as {
      complete?: unknown;
      quotes?: Array<Record<string, unknown>>;
    } | null;
    const rows = Array.isArray(response?.quotes) ? response.quotes : [];
    const seen = new Set(
      rows.map((row) => row && typeof row === "object" ? row.quote_id : null),
    );
    const complete = response?.complete === true &&
      rows.length === ids.length && seen.size === ids.length &&
      ids.every((id) => seen.has(id));
    for (const id of ids) {
      const snapshot = complete
        ? {
          complete: true,
          quotes: [rows.find((row) => row.quote_id === id)],
        }
        : data;
      let invalid = !complete;
      if (complete) {
        try {
          recurringQuoteCharges(snapshot, [id]);
        } catch {
          invalid = true;
        }
      }
      chargeByQuote.set(id, { snapshot, invalid });
    }
  }
  for (const booking of group) {
    const context = contexts.get(booking.id)!;
    const charge = chargeByQuote.get(booking.quote_id ?? "");
    if (charge && !context.quoteIssue) {
      context.chargeSnapshot = charge.snapshot;
      if (charge.invalid) context.quoteIssue = "quote_charge_review";
    }
  }
}

/** Read-only I/O boundary. Every batch is scoped to one source organization. */
export async function loadRecurringPlanningData(
  supabase: SupabaseClient,
  organizationId?: string | null,
  metrics?: RecurringPerformance,
): Promise<PlanningContext[]> {
  const budget: ReadBudget = { rows: 0, pages: 0 };
  const bookings = await readAll<BookingSource>(
    (last) => {
      let query = supabase.from("bookings").select(BOOKING_FIELDS, {
        count: "exact",
      })
        .eq("recurring_billing", true).eq("status", "confirmed").order("id");
      if (organizationId) query = query.eq("organization_id", organizationId);
      if (last) query = query.gt("id", last.id);
      return query;
    },
    budget,
    (row) => [row.id],
    "bookings",
    metrics,
  );
  const contexts = new Map<string, PlanningContext>();
  const byOrganization = new Map<string, BookingSource[]>();
  for (const booking of bookings) {
    if (
      !booking.id || !booking.organization_id || contexts.has(booking.id) ||
      (organizationId && booking.organization_id !== organizationId)
    ) {
      throw new Error(
        "La reserva no pertenece al contexto de facturación esperado",
      );
    }
    contexts.set(booking.id, {
      booking,
      invoices: [],
      fiscal: null,
      quoteIssue: recurringQuoteIssue(
        booking.quote_id,
        booking.organization_id,
        booking.quotes,
      ),
      chargeSnapshot: null,
    });
    const group = byOrganization.get(booking.organization_id) ?? [];
    group.push(booking);
    byOrganization.set(booking.organization_id, group);
  }
  for (const [org, group] of byOrganization) {
    const scope = { org, group, contexts, budget, metrics };
    // These reads share the same organization and depend only on the bookings.
    // Each branch retains sequential keyset pages and the global read budget.
    await Promise.all([
      loadFiscalSnapshots(supabase, scope),
      loadInvoiceHistory(supabase, scope),
      loadQuoteCharges(supabase, scope),
    ]);
  }
  return bookings.map((booking) => contexts.get(booking.id)!);
}
